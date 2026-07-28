from __future__ import annotations

import csv
import json
from bisect import bisect_left
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path

import fastapi

router = fastapi.APIRouter()
DATA_ROOT = Path(__file__).resolve().parents[1] / "db" / "datasets" / "bertopic"
BUNDLES = {
    "telegram": ("sudan_hm_min4", "telegram_topics.tsv", "telegram_topics_3d.tsv", "telegram_messages.tsv", "telegram_message_topic_presence.tsv"),
    "mediacloud": ("mediacloud_run_02_bertopic_1", "mediacloud_topics.tsv", "mediacloud_topics_3d.tsv", "mediacloud_stories.tsv", None),
}
MOBILITY_THEME_LABELS = {
    "refugees_displacement": "Refugees and displacement",
    "immigration_documents": "Immigration, borders and documents",
    "returns_deportations": "Returns and deportations",
    "trafficking_smuggling": "Trafficking and smuggling",
    "migrant_journeys": "Migrant journeys",
    "diaspora": "Diaspora",
}

def _rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


@router.get("/{alpha_2}/bertopic/explorer")
async def explorer(alpha_2: str, source: str = "telegram", start: str | None = None, end: str | None = None):
    if alpha_2.lower() != "sd" or source not in BUNDLES:
        raise fastapi.HTTPException(status_code=404, detail="BERTopic data is available only for Sudan.")
    bundle, topics_file, coords_file, docs_file, presence_file = BUNDLES[source]
    root = DATA_ROOT / bundle
    topics = _rows(root / topics_file)
    metadata = json.loads((root / "dataset_metadata.json").read_text(encoding="utf-8"))
    coordinates = {row["topic_id"]: row for row in _rows(root / coords_file)}
    # Keep the original BERTopic two-dimensional topic map separate from the
    # FlowSight 3D projection. Taking x/y from a 3D UMAP projection is not a
    # meaningful 2D projection and produces visibly distorted layouts.
    coordinates_2d = {row["Topic"]: row for row in _rows(root / "raw_export" / "topics_map.tsv")}
    # These neighbourhoods are calculated from the coordinates used by the 3D
    # map. They colour the map only; the sunburst uses the separate curated
    # dashboard hierarchy.
    families = {row["topic_id"]: row for row in _rows(root / "topic_map_neighborhoods.tsv")}
    taxonomy_labels = {row["family_id"]: row["family_label"] for row in _rows(root / "topic_family_labels.tsv")}
    taxonomy_families = {
        row["topic_id"]: {**row, "family_label": taxonomy_labels[row["family_id"]]}
        for row in _rows(root / "topic_families.tsv")
    }
    mobility_tags: dict[str, list[dict[str, str]]] = defaultdict(list)
    mobility_tags_file = root / "human_mobility_topic_tags.tsv"
    if mobility_tags_file.exists():
        for row in _rows(mobility_tags_file):
            theme_id = row["mobility_theme"]
            mobility_tags[row["topic_id"]].append({
                "id": theme_id,
                "label": MOBILITY_THEME_LABELS.get(theme_id, theme_id.replace("_", " ").title()),
            })
    documents = _rows(root / docs_file)
    start_date, end_date = date.fromisoformat(start) if start else None, date.fromisoformat(end) if end else None
    def in_range(value: str) -> bool:
        current = date.fromisoformat(value[:10])
        return (start_date is None or current >= start_date) and (end_date is None or current <= end_date)
    documents = [row for row in documents if in_range(row["timestamp"] if source == "telegram" else row["publish_date"])]
    if source == "telegram":
        allowed = {row["message_key"] for row in documents}
        presence = [row for row in _rows(root / presence_file) if row["message_key"] in allowed]
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
        "x_2d": float(coordinates_2d[topic["topic_id"]]["x"]),
        "y_2d": float(coordinates_2d[topic["topic_id"]]["y"]),
        "mobility_tags": mobility_tags[topic["topic_id"]],
        "document_count": counts.get(topic["topic_id"], 0),
    } for topic in topics]
    points.sort(key=lambda row: row["document_count"], reverse=True)
    if source == "telegram":
        assigned_record_count = len({row["message_key"] for row in presence})
        assigned_unit_count = sum(int(row["evidence_chunk_count"]) for row in presence)
        assigned_label = "Assigned messages"
        assigned_detail = f"{assigned_unit_count:,} assigned chunks"
        total_chunk_count = sum(int(topic["chunk_count"]) for topic in topics) + int(metadata.get("outlier_chunk_count", 0))
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
async def charts(alpha_2: str, source: str = "telegram"):
    if alpha_2.lower() != "sd" or source not in BUNDLES:
        raise fastapi.HTTPException(status_code=404, detail="BERTopic data is available only for Sudan.")
    bundle, topics_file, _, docs_file, presence_file = BUNDLES[source]
    root = DATA_ROOT / bundle
    topics = {row["topic_id"]: row for row in _rows(root / topics_file)}
    labels = {row["family_id"]: row["family_label"] for row in _rows(root / "topic_family_labels.tsv")}
    families = {row["topic_id"]: {**row, "family_label": labels.get(row["family_id"], row["family_label"])} for row in _rows(root / "topic_families.tsv")}
    documents = _rows(root / docs_file)
    if source == "telegram":
        documents_by_key = {row["message_key"]: row for row in documents}
        assignments = [(row["topic_id"], documents_by_key[row["message_key"]]) for row in _rows(root / presence_file) if row["message_key"] in documents_by_key]
        source_key, date_key = "channel_url", "timestamp"
    else:
        assignments = [(row["topic_id"], row) for row in documents if row["topic_id"] != "-1"]
        source_key, date_key = "media_name", "publish_date"
    topic_counts = Counter(topic_id for topic_id, _ in assignments)
    # Use BERTopic's exported time bins for the explorer, including its
    # period-specific representative words. This is the same source used by
    # BERTIP's Topics over Time figure; other FlowSight charts retain their
    # message-presence calculations below.
    topics_over_time_export = _rows(root / "raw_export" / "topics_over_time.tsv")
    topics_over_time = [
        row for row in topics_over_time_export
        if row["Topic"] != "-1" and row["Topic"] in topics
    ]
    selected_topics = sorted({row["Topic"] for row in topics_over_time}, key=int)
    bin_timestamps = sorted({row["Timestamp"] for row in topics_over_time_export})
    bin_datetimes = [datetime.fromisoformat(value[:26]) for value in bin_timestamps]
    def bin_for(value: str) -> str | None:
        index = bisect_left(bin_datetimes, datetime.fromisoformat(value[:26])) - 1
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
    map_clusters = {row["topic_id"]: row for row in _rows(root / "topic_map_neighborhoods.tsv")}
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
            "timestamp": row["Timestamp"],
            "topic_id": row["Topic"],
            "value": int(row["Frequency"]),
            "words": row["Words"],
        } for row in topics_over_time],
        "share_bins": [{"timestamp": timestamp, "total": bin_totals[timestamp]} for timestamp in bin_timestamps],
        "timeline_share": [{
            "timestamp": timestamp,
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
    if alpha_2.lower() != "sd" or source not in BUNDLES:
        raise fastapi.HTTPException(status_code=404, detail="BERTopic data is available only for Sudan.")
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    bundle, _, _, docs_file, presence_file = BUNDLES[source]
    root = DATA_ROOT / bundle
    documents = _rows(root / docs_file)
    targets = {str(topic_id)} if topic_id is not None else set()
    if topic_ids:
        targets.update(item.strip() for item in topic_ids.split(",") if item.strip())
    if not targets:
        raise fastapi.HTTPException(status_code=422, detail="Select at least one topic.")
    start_time = datetime.fromisoformat(start.replace("Z", "")) if start else None
    end_time = datetime.fromisoformat(end.replace("Z", "")) if end else None
    end_exclusive_time = datetime.fromisoformat(end_exclusive.replace("Z", "")) if end_exclusive else None
    def in_range(value: str) -> bool:
        current = datetime.fromisoformat(value[:26])
        return (
            (start_time is None or current >= start_time)
            and (end_time is None or current <= end_time)
            and (end_exclusive_time is None or current < end_exclusive_time)
        )
    if source == "mediacloud":
        matching = [row for row in documents if row["topic_id"] in targets and in_range(row["publish_date"])]
        return {"records": matching[offset : offset + limit], "total": len(matching), "has_more": offset + limit < len(matching)}
    topics = {row["topic_id"]: row["display_label"] for row in _rows(root / BUNDLES[source][1])}
    evidence = defaultdict(list)
    for row in _rows(root / presence_file):
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
