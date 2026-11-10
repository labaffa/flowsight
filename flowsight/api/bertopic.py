from __future__ import annotations

import json
from bisect import bisect_left
from collections import Counter, defaultdict
from datetime import date, datetime

import fastapi
from psycopg.rows import dict_row

from flowsight import config

router = fastapi.APIRouter()
SCHEMA = config.PG_SCHEMA_NAME
MOBILITY_THEME_LABELS = {
    "refugees_displacement": "Refugees and displacement",
    "immigration_documents": "Immigration, borders and documents",
    "returns_deportations": "Returns and deportations",
    "trafficking_smuggling": "Trafficking and smuggling",
    "migrant_journeys": "Migrant journeys",
    "diaspora": "Diaspora",
}


def _parse_datetime(value: str) -> datetime:
    """Parse PostgreSQL timestamp text without depending on its fraction precision."""
    return datetime.fromisoformat(value[:19])

async def _query(request: fastapi.Request, statement: str, params: tuple = ()) -> list[dict]:
    """Read BERTopic results from the currently active versioned DB run."""
    async with request.app.async_pool.connection() as connection:
        async with connection.cursor(row_factory=dict_row) as cursor:
            await cursor.execute(statement, params)
            return await cursor.fetchall()


async def _active_run(request: fastapi.Request, source: str) -> str:
    rows = await _query(
        request,
        f"SELECT id FROM {SCHEMA}.bertopic_model_run WHERE source = %s AND is_active",
        (source,),
    )
    if not rows:
        raise fastapi.HTTPException(status_code=503, detail=f"No active BERTopic {source} model run is loaded.")
    return rows[0]["id"]


async def _dataset(request: fastapi.Request, source: str) -> dict[str, object]:
    run_id = await _active_run(request, source)
    topics = await _query(request, f"""
        SELECT topic_id::text, display_label, raw_name, keywords,
               unit_count::text AS chunk_count, label_status
        FROM {SCHEMA}.bertopic_topic WHERE run_id = %s ORDER BY topic_id
    """, (run_id,))
    documents = await _query(request, f"""
        SELECT document_key, source_record_id, channel_id::text, channel_url,
               message_id::text, media_name, media_url, url, language,
               published_at::text AS published_at, title_en, title_original, body_en,
               modeled_text, source_translation_en, original_text
        FROM {SCHEMA}.bertopic_document WHERE run_id = %s ORDER BY published_at
    """, (run_id,))
    assignments = await _query(request, f"""
        SELECT document_key, topic_id::text, evidence_chunk_count::text, spans::text AS spans
        FROM {SCHEMA}.bertopic_document_topic WHERE run_id = %s
    """, (run_id,))
    coordinates = await _query(request, f"""
        SELECT topic_id::text, x_2d, y_2d, x_3d AS x, y_3d AS y, z_3d AS z
        FROM {SCHEMA}.bertopic_topic_coordinate WHERE run_id = %s
    """, (run_id,))
    family_rows = await _query(request, f"""
        SELECT member.topic_id::text, member.family_id, family.family_label
        FROM {SCHEMA}.bertopic_topic_family_member member
        JOIN {SCHEMA}.bertopic_topic_family family
          ON family.run_id = member.run_id AND family.family_id = member.family_id
        WHERE member.run_id = %s
    """, (run_id,))
    neighborhoods = await _query(request, f"""
        SELECT topic_id::text, neighborhood_id AS family_id, neighborhood_label AS family_label,
               supercluster_id, supercluster_label
        FROM {SCHEMA}.bertopic_topic_neighborhood WHERE run_id = %s
    """, (run_id,))
    timeline = await _query(request, f"""
        SELECT topic_id::text AS "Topic", representative_words AS "Words",
               frequency::text AS "Frequency", bin_start::text AS "Timestamp",
               bin_end::text AS "Bin_End"
        FROM {SCHEMA}.bertopic_topic_time_bin WHERE run_id = %s ORDER BY bin_start, topic_id
    """, (run_id,))

    if source == "telegram":
        docs = [{
            "message_key": row["document_key"], "channel_id": row["channel_id"],
            "channel_url": row["channel_url"], "message_id": row["message_id"],
            "timestamp": row["published_at"], "modeled_text": row["modeled_text"],
            "source_translation_en": row["source_translation_en"], "original_text": row["original_text"],
        } for row in documents]
        presence = [{
            "message_key": row["document_key"], "topic_id": row["topic_id"],
            "evidence_chunk_count": row["evidence_chunk_count"], "spans": row["spans"],
        } for row in assignments]
    else:
        assignment_by_document = {row["document_key"]: row["topic_id"] for row in assignments}
        docs = [{
            "story_id": row["document_key"], "topic_id": assignment_by_document.get(row["document_key"], "-1"),
            "title_en": row["title_en"], "title_original": row["title_original"], "body_en": row["body_en"],
            "media_name": row["media_name"], "media_url": row["media_url"], "url": row["url"],
            "language": row["language"], "publish_date": row["published_at"],
        } for row in documents]
        presence = []
    return {"run_id": run_id, "topics": topics, "documents": docs, "presence": presence,
            "coordinates": coordinates, "families": family_rows, "neighborhoods": neighborhoods,
            "timeline": timeline}


@router.get("/{alpha_2}/bertopic/explorer")
async def explorer(request: fastapi.Request, alpha_2: str, source: str = "telegram", start: str | None = None, end: str | None = None):
    if alpha_2.lower() != "sd" or source not in {"telegram", "mediacloud"}:
        raise fastapi.HTTPException(status_code=404, detail="BERTopic data is available only for Sudan.")
    dataset = await _dataset(request, source)
    topics = dataset["topics"]
    coordinates = {row["topic_id"]: row for row in dataset["coordinates"]}
    families = {row["topic_id"]: row for row in dataset["neighborhoods"]}
    taxonomy_families = {row["topic_id"]: row for row in dataset["families"]}
    mobility_tags: dict[str, list[dict[str, str]]] = defaultdict(list)
    documents = dataset["documents"]
    start_date, end_date = date.fromisoformat(start) if start else None, date.fromisoformat(end) if end else None
    def in_range(value: str) -> bool:
        current = date.fromisoformat(value[:10])
        return (start_date is None or current >= start_date) and (end_date is None or current <= end_date)
    documents = [row for row in documents if in_range(row["timestamp"] if source == "telegram" else row["publish_date"])]
    if source == "telegram":
        allowed = {row["message_key"] for row in documents}
        presence = [row for row in dataset["presence"] if row["message_key"] in allowed]
        counts = Counter(row["topic_id"] for row in presence)
    else:
        counts = Counter(row["topic_id"] for row in documents if row["topic_id"] != "-1")
    points = [{
        **topic,
        **families[topic["topic_id"]],
        "taxonomy_family_id": taxonomy_families[topic["topic_id"]]["family_id"],
        "taxonomy_family_label": taxonomy_families[topic["topic_id"]]["family_label"],
        "x": float(coordinates[topic["topic_id"]]["x"]),
        "y": float(coordinates[topic["topic_id"]]["y"]),
        "z": float(coordinates[topic["topic_id"]]["z"]),
        "x_2d": float(coordinates[topic["topic_id"]]["x_2d"]),
        "y_2d": float(coordinates[topic["topic_id"]]["y_2d"]),
        "mobility_tags": mobility_tags[topic["topic_id"]],
        "document_count": counts.get(topic["topic_id"], 0),
    } for topic in topics]
    points.sort(key=lambda row: row["document_count"], reverse=True)
    if source == "telegram":
        assigned_record_count = len({row["message_key"] for row in presence})
        assigned_unit_count = sum(int(row["evidence_chunk_count"]) for row in presence)
        assigned_label = "Assigned messages"
        assigned_detail = f"{assigned_unit_count:,} assigned chunks"
        total_chunk_count = sum(int(topic["chunk_count"]) for topic in topics)
        record_detail = f"{total_chunk_count:,} modelled chunks"
    else:
        assigned_record_count = sum(1 for row in documents if row["topic_id"] != "-1")
        assigned_label = "Assigned stories"
        assigned_detail = "Stories with a non-outlier topic"
        record_detail = "One topic-model unit per story title"
    period_key = "timestamp" if source == "telegram" else "publish_date"
    return {
        "source": source,
        "metric_label": "Messages mentioning topic" if source == "telegram" else "Stories assigned to topic",
        "total_documents": len(documents),
        "topics": points,
        "kpis": {
            "record_label": "Messages in corpus" if source == "telegram" else "Stories in corpus",
            "record_detail": record_detail,
            "topic_count": sum(point["document_count"] > 0 for point in points),
            "assigned_record_count": assigned_record_count,
            "assigned_label": assigned_label,
            "assigned_detail": assigned_detail,
            "period_start": min(row[period_key][:10] for row in documents) if documents else None,
            "period_end": max(row[period_key][:10] for row in documents) if documents else None,
        },
    }


@router.get("/{alpha_2}/bertopic/charts")
async def charts(request: fastapi.Request, alpha_2: str, source: str = "telegram"):
    if alpha_2.lower() != "sd" or source not in {"telegram", "mediacloud"}:
        raise fastapi.HTTPException(status_code=404, detail="BERTopic data is available only for Sudan.")
    dataset = await _dataset(request, source)
    topics = {row["topic_id"]: row for row in dataset["topics"]}
    families = {row["topic_id"]: row for row in dataset["families"]}
    labels = {row["family_id"]: row["family_label"] for row in families.values()}
    documents = dataset["documents"]
    if source == "telegram":
        documents_by_key = {row["message_key"]: row for row in documents}
        assignments = [(row["topic_id"], documents_by_key[row["message_key"]]) for row in dataset["presence"] if row["message_key"] in documents_by_key]
        source_key, date_key = "channel_url", "timestamp"
    else:
        assignments = [(row["topic_id"], row) for row in documents if row["topic_id"] != "-1"]
        source_key, date_key = "media_name", "publish_date"
    topic_counts = Counter(topic_id for topic_id, _ in assignments)
    # Use BERTopic's exported time bins for the explorer, including its
    # period-specific representative words. This is the same source used by
    # BERTIP's Topics over Time figure; other FlowSight charts retain their
    # message-presence calculations below.
    topics_over_time_export = dataset["timeline"]
    topics_over_time = [
        row for row in topics_over_time_export
        if row["Topic"] != "-1" and row["Topic"] in topics
    ]
    selected_topics = sorted({row["Topic"] for row in topics_over_time}, key=int)
    bin_timestamps = sorted({row["Timestamp"] for row in topics_over_time_export})
    bin_datetimes = [_parse_datetime(value) for value in bin_timestamps]
    bin_display_timestamps = {row["Timestamp"]: row["Bin_End"] for row in topics_over_time_export}
    def bin_for(value: str) -> str | None:
        index = bisect_left(bin_datetimes, _parse_datetime(value)) - 1
        return bin_timestamps[index] if 0 <= index < len(bin_timestamps) else None
    message_bin = {
        row["message_key"]: bin_for(row["timestamp"])
        for row in documents
    } if source == "telegram" else {
        row["story_id"]: bin_for(row["publish_date"])
        for row in documents
    }
    bin_totals = Counter(bin_id for bin_id in message_bin.values() if bin_id is not None)
    bin_presence = {
        (bin_id, topic_id, document_key)
        for topic_id, row in assignments
        for document_key, bin_id in [(row["message_key"] if source == "telegram" else row["story_id"], message_bin.get(row["message_key"] if source == "telegram" else row["story_id"]))]
        if bin_id is not None
    }
    topic_bin_presence = Counter((bin_id, topic_id) for bin_id, topic_id, _ in bin_presence)
    # Match BERTIP's source-selection rule: rank sources by their original
    # document/message volume and keep the cumulative prefix up to 90%.
    # Telegram topic assignments are multi-label, so assignment volume must not
    # be used here or prolific multi-topic messages would distort the cut.
    source_counts = Counter(row[source_key] for row in documents)
    source_limit = 0.90
    cumulative = 0
    selected_sources = []
    for source_name, count in source_counts.most_common():
        cumulative += count
        if cumulative / max(len(documents), 1) <= source_limit:
            selected_sources.append(source_name)
    if not selected_sources and source_counts:
        selected_sources = [source_counts.most_common(1)[0][0]]
    family_counts = Counter()
    for topic_id, count in topic_counts.items(): family_counts[families[topic_id]["family_id"]] += count
    family_ids = sorted(labels, key=lambda family_id: (-family_counts[family_id], family_id))
    selected_source_set = set(selected_sources)
    # A Telegram message may contain several topics from the same top-level
    # family. Presence-based cells count that message once per family.
    family_presence = {
        (
            families[topic_id]["family_id"],
            row[source_key],
            row["message_key"] if source == "telegram" else row["story_id"],
        )
        for topic_id, row in assignments
        if row[source_key] in selected_source_set
    }
    heatmap = Counter((family_id, source_name) for family_id, source_name, _ in family_presence)
    family_presence_counts = Counter(family_id for family_id, _, _ in family_presence)
    scope_total = sum(source_counts[source_name] for source_name in selected_sources)
    map_clusters = {row["topic_id"]: row for row in dataset["neighborhoods"]}
    cluster_labels = {row["family_id"]: row["family_label"] for row in map_clusters.values()}
    cluster_counts = Counter()
    for topic_id, count in topic_counts.items():
        cluster_counts[map_clusters[topic_id]["family_id"]] += count
    cluster_ids = sorted(cluster_labels, key=lambda cluster_id: (-cluster_counts[cluster_id], int(cluster_id)))
    sunburst = [{"id": "map-root", "parent": "", "name": "All topics"}]
    if source == "telegram":
        region_labels = {row["supercluster_id"]: row["supercluster_label"] for row in map_clusters.values()}
        region_clusters: dict[str, set[str]] = defaultdict(set)
        cluster_regions = {row["family_id"]: row["supercluster_id"] for row in map_clusters.values()}
        region_counts = Counter()
        for topic_id, row in map_clusters.items():
            region_clusters[row["supercluster_id"]].add(row["family_id"])
            region_counts[row["supercluster_id"]] += topic_counts.get(topic_id, 0)
        region_ids = sorted(region_labels, key=lambda region_id: (-region_counts[region_id], int(region_id)))
        sunburst += [{
            "id": f"region-{region_id}",
            "parent": "map-root",
            "name": region_labels[region_id],
        } for region_id in region_ids]
        sunburst += [{
            "id": f"cluster-{cluster_id}",
            "parent": f"region-{cluster_regions[cluster_id]}",
            "name": cluster_labels[cluster_id],
        } for cluster_id in cluster_ids]
    else:
        sunburst += [{
            "id": f"cluster-{cluster_id}",
            "parent": "map-root",
            "name": cluster_labels[cluster_id],
        } for cluster_id in cluster_ids]
    sunburst += [{
        "id": f"topic-{topic_id}",
        "parent": f"cluster-{map_clusters[topic_id]['family_id']}",
        "name": topic["display_label"],
        "value": topic_counts.get(topic_id, 0),
    } for topic_id, topic in topics.items()]
    return {
        "metric_label": "Messages" if source == "telegram" else "Stories",
        "timeline": [{
            # The BERTopic export labels its final equal-width bin at its
            # internal start.  The dashboard displays the explicit bin end so
            # August data is not presented as a July observation.
            "timestamp": row["Bin_End"],
            "topic_id": row["Topic"],
            "value": int(row["Frequency"]),
            "words": row["Words"],
        } for row in topics_over_time],
        "share_bins": [{"timestamp": bin_display_timestamps[timestamp], "total": bin_totals[timestamp]} for timestamp in bin_timestamps],
        "timeline_share": [{
            "timestamp": bin_display_timestamps[timestamp],
            "topic_id": topic_id,
            "value": count,
            "share": count / max(bin_totals[timestamp], 1),
        } for (timestamp, topic_id), count in topic_bin_presence.items()],
        "topics": [{"id": topic_id, "label": topics[topic_id]["display_label"]} for topic_id in selected_topics],
        "families": [{"id": family_id, "label": labels[family_id], "value": family_counts[family_id]} for family_id in family_ids],
        "sources": [{"name": source, "total": source_counts[source]} for source in selected_sources],
        "source_threshold": source_limit,
        "heatmap": [{
            "family_id": family_id,
            "source": source_name,
            "value": count,
            "lift": count / max((family_presence_counts[family_id] * source_counts[source_name]) / max(scope_total, 1), 1e-12),
            "corpus_share": count / max(scope_total, 1),
        } for (family_id, source_name), count in heatmap.items()],
        "sunburst": sunburst,
    }


@router.get("/{alpha_2}/bertopic/records")
async def records(
    request: fastapi.Request,
    alpha_2: str,
    source: str,
    topic_id: int | None = None,
    topic_ids: str | None = None,
    start: str | None = None,
    end: str | None = None,
    end_exclusive: str | None = None,
    limit: int = 20,
    offset: int = 0,
):
    if alpha_2.lower() != "sd" or source not in {"telegram", "mediacloud"}:
        raise fastapi.HTTPException(status_code=404, detail="BERTopic data is available only for Sudan.")
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    dataset = await _dataset(request, source)
    documents = dataset["documents"]
    targets = {str(topic_id)} if topic_id is not None else set()
    if topic_ids:
        targets.update(item.strip() for item in topic_ids.split(",") if item.strip())
    if not targets:
        raise fastapi.HTTPException(status_code=422, detail="Select at least one topic.")
    start_time = datetime.fromisoformat(start.replace("Z", "")) if start else None
    end_time = datetime.fromisoformat(end.replace("Z", "")) if end else None
    end_exclusive_time = datetime.fromisoformat(end_exclusive.replace("Z", "")) if end_exclusive else None
    def in_range(value: str) -> bool:
        current = _parse_datetime(value)
        return (
            (start_time is None or current >= start_time)
            and (end_time is None or current <= end_time)
            and (end_exclusive_time is None or current < end_exclusive_time)
        )
    if source == "mediacloud":
        matching = [row for row in documents if row["topic_id"] in targets and in_range(row["publish_date"])]
        return {"records": matching[offset : offset + limit], "total": len(matching), "has_more": offset + limit < len(matching)}
    topics = {row["topic_id"]: row["display_label"] for row in dataset["topics"]}
    evidence = defaultdict(list)
    for row in dataset["presence"]:
        evidence[row["message_key"]].append({"topic_id": row["topic_id"], "topic_label": topics.get(row["topic_id"], f"Topic {row['topic_id']}"), "spans": json.loads(row["spans"])})
    matching = [
        row for row in documents
        if in_range(row["timestamp"])
        and any(item["topic_id"] in targets for item in evidence[row["message_key"]])
    ]
    records = [{
        **row,
        "message_url": f"{row['channel_url'].rstrip('/')}/{row['message_id']}",
        "topic_spans": evidence[row["message_key"]],
    } for row in matching[offset : offset + limit]]
    return {"records": records, "total": len(matching), "has_more": offset + limit < len(matching)}
