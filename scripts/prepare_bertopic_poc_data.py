#!/usr/bin/env python3
"""Copy and normalize the Sudan BERTopic POC data for the FlowSight app.

The dashboard must use message/topic *presence*: a Telegram message may be
linked to more than one BERTopic topic.  This script preserves the original
chunk spans as evidence while producing small, directly consumable tables for
the UI.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
from collections import defaultdict
from pathlib import Path


REQUIRED_EXPORT_FILES = (
    "classification.tsv",
    "topics_info.tsv",
    "topic_words.tsv",
    "topics_map.tsv",
    "topics_over_time.tsv",
    "topics_per_class.tsv",
    "hierarchical_topics.tsv",
    "run_metadata.json",
    "export_metadata.json",
)


def read_tsv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


def write_tsv(path: Path, fields: list[str], rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, delimiter="\t", extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def message_key(row: dict[str, str]) -> str:
    return f'{row["channel_id"]}:{row["message_id"]}'


def fallback_label(raw_name: str, topic_id: str) -> str:
    value = re.sub(rf"^{re.escape(topic_id)}_", "", raw_name)
    value = value.replace("_", " · ").strip()
    return value.title() if value else f"Topic {topic_id}"


def load_label_overrides(path: Path) -> tuple[dict[str, str], dict[str, str]]:
    if not path.exists():
        return {}, {}
    rows = read_tsv(path)
    return (
        {row["topic_id"]: row["display_label"] for row in rows if row.get("display_label")},
        {row["parent_id"]: row["display_label"] for row in rows if row.get("parent_id") and row.get("display_label")},
    )


def build(args: argparse.Namespace) -> None:
    export_dir = args.export_dir.resolve()
    messages_path = args.messages.resolve()
    destination = args.destination.resolve()
    raw_destination = destination / "raw_export"

    missing = [name for name in REQUIRED_EXPORT_FILES if not (export_dir / name).is_file()]
    if missing:
        raise SystemExit(f"Missing required BERTopic export files: {', '.join(missing)}")
    if not messages_path.is_file():
        raise SystemExit(f"Missing analyzed-message corpus: {messages_path}")

    if destination.exists() and any(destination.iterdir()) and not args.replace:
        raise SystemExit(f"Destination already contains data: {destination}. Use --replace to rebuild it.")
    if args.replace and destination.exists():
        shutil.rmtree(destination)
    raw_destination.mkdir(parents=True, exist_ok=True)
    for name in REQUIRED_EXPORT_FILES:
        shutil.copy2(export_dir / name, raw_destination / name)

    topic_overrides, hierarchy_overrides = load_label_overrides(args.labels)
    source_messages = read_tsv(messages_path)
    messages = {message_key(row): row for row in source_messages}
    classifications = read_tsv(export_dir / "classification.tsv")
    topics_info = [row for row in read_tsv(export_dir / "topics_info.tsv") if row["Topic"] != "-1"]
    topics_by_id = {row["Topic"]: row for row in topics_info}

    spans: dict[tuple[str, str], list[dict[str, object]]] = defaultdict(list)
    chunks_by_message: dict[str, list[dict[str, str]]] = defaultdict(list)
    all_assignment_messages: set[str] = set()
    topic_samples: dict[str, list[dict[str, str]]] = defaultdict(list)
    offset_checks = 0
    offset_matches = 0
    for row in classifications:
        key = message_key(row)
        all_assignment_messages.add(key)
        analyzed_text = messages.get(key, {}).get("text_translation_en", "")
        start_char = int(row["start_char"])
        end_char = int(row["end_char"])
        offset_checks += 1
        if analyzed_text[start_char:end_char] == row["chunk_text"]:
            offset_matches += 1
        chunks_by_message[key].append(row)
        topic_id = row["topic_id"]
        if topic_id == "-1":
            continue
        spans[(key, topic_id)].append(
            {
                "chunk_id": int(row["chunk_id"]),
                "start_char": start_char,
                "end_char": end_char,
            }
        )
        if len(topic_samples[topic_id]) < 3:
            topic_samples[topic_id].append(row)

    missing_messages = sorted(all_assignment_messages - messages.keys())
    if missing_messages:
        raise SystemExit(
            f"{len(missing_messages)} modeled messages are absent from the analyzed-message corpus "
            f"(first: {missing_messages[0]})."
        )

    output_messages: list[dict[str, object]] = []
    display_spans: dict[tuple[str, int], tuple[int, int]] = {}
    for key in sorted(all_assignment_messages, key=lambda value: tuple(map(int, value.split(":")))):
        row = messages[key]
        display_parts: list[str] = []
        display_offset = 0
        for chunk in sorted(chunks_by_message[key], key=lambda value: int(value["chunk_id"])):
            if display_parts:
                separator = "\n\n"
                display_parts.append(separator)
                display_offset += len(separator)
            chunk_text = chunk["chunk_text"]
            display_spans[(key, int(chunk["chunk_id"]))] = (display_offset, display_offset + len(chunk_text))
            display_parts.append(chunk_text)
            display_offset += len(chunk_text)
        output_messages.append(
            {
                "message_key": key,
                "channel_id": row["channel_id"],
                "channel_url": row["channel_url"],
                "message_id": row["message_id"],
                "timestamp": row["timestamp"],
                "modeled_text": "".join(display_parts),
                "source_translation_en": row["text_translation_en"],
                "original_text": row["text"],
            }
        )
    write_tsv(
        destination / "telegram_messages.tsv",
        ["message_key", "channel_id", "channel_url", "message_id", "timestamp", "modeled_text", "source_translation_en", "original_text"],
        output_messages,
    )

    presence_rows: list[dict[str, object]] = []
    evidence_rows: list[dict[str, object]] = []
    for (key, topic_id), topic_spans in sorted(spans.items(), key=lambda item: (item[0][0], int(item[0][1]))):
        topic_spans.sort(key=lambda item: (item["start_char"], item["end_char"]))
        for span in topic_spans:
            display_start, display_end = display_spans[(key, int(span["chunk_id"]))]
            span["source_start_char"] = span["start_char"]
            span["source_end_char"] = span["end_char"]
            span["start_char"] = display_start
            span["end_char"] = display_end
            evidence_rows.append({"message_key": key, "topic_id": topic_id, **span})
        presence_rows.append(
            {
                "message_key": key,
                "topic_id": topic_id,
                "evidence_chunk_count": len(topic_spans),
                "spans": json.dumps(topic_spans, separators=(",", ":")),
            }
        )

    write_tsv(
        destination / "telegram_message_topic_presence.tsv",
        ["message_key", "topic_id", "evidence_chunk_count", "spans"],
        presence_rows,
    )
    write_tsv(
        destination / "telegram_topic_evidence_spans.tsv",
        ["message_key", "topic_id", "chunk_id", "start_char", "end_char", "source_start_char", "source_end_char"],
        evidence_rows,
    )

    topic_rows = []
    curation_rows = []
    for row in topics_info:
        topic_id = row["Topic"]
        display_label = topic_overrides.get(topic_id, fallback_label(row["Name"], topic_id))
        topic_rows.append(
            {
                "topic_id": topic_id,
                "display_label": display_label,
                "raw_name": row["Name"],
                "keywords": row["Representation"],
                "chunk_count": row["Count"],
                "label_status": "reviewed" if topic_id in topic_overrides else "needs_review",
            }
        )
        samples = topic_samples.get(topic_id, [])
        curation_rows.append(
            {
                "topic_id": topic_id,
                "display_label": topic_overrides.get(topic_id, ""),
                "raw_name": row["Name"],
                "keywords": row["Representation"],
                "representative_excerpt_1": samples[0]["chunk_text"] if len(samples) > 0 else "",
                "representative_excerpt_2": samples[1]["chunk_text"] if len(samples) > 1 else "",
                "representative_excerpt_3": samples[2]["chunk_text"] if len(samples) > 2 else "",
            }
        )
    write_tsv(destination / "telegram_topics.tsv", ["topic_id", "display_label", "raw_name", "keywords", "chunk_count", "label_status"], topic_rows)
    write_tsv(
        destination / "topic_label_curation.tsv",
        ["topic_id", "display_label", "raw_name", "keywords", "representative_excerpt_1", "representative_excerpt_2", "representative_excerpt_3"],
        curation_rows,
    )

    hierarchy_rows = read_tsv(export_dir / "hierarchical_topics.tsv")
    hierarchy_output = []
    hierarchy_curation = []
    for row in hierarchy_rows:
        parent_id = row["Parent_ID"]
        label = hierarchy_overrides.get(parent_id, fallback_label(row["Parent_Name"], parent_id))
        hierarchy_output.append({**row, "display_label": label, "label_status": "reviewed" if parent_id in hierarchy_overrides else "needs_review"})
        hierarchy_curation.append({"parent_id": parent_id, "display_label": hierarchy_overrides.get(parent_id, ""), "raw_name": row["Parent_Name"], "topic_ids": row["Topics"]})
    write_tsv(destination / "telegram_topic_hierarchy.tsv", list(hierarchy_rows[0].keys()) + ["display_label", "label_status"], hierarchy_output)
    write_tsv(destination / "hierarchy_label_curation.tsv", ["parent_id", "display_label", "raw_name", "topic_ids"], hierarchy_curation)

    metadata = {
        "model_run": "bertopic_200626_min4",
        "source": "telegram",
        "assignment_semantics": "topic presence: a message is linked to every non-outlier topic assigned to one or more of its chunks",
        "message_count": len(output_messages),
        "topic_count": len(topics_info),
        "message_topic_presence_count": len(presence_rows),
        "outlier_chunk_count": sum(1 for row in classifications if row["topic_id"] == "-1"),
        "exact_offset_match_count": offset_matches,
        "offset_check_count": offset_checks,
        "exact_offset_match_rate": round(offset_matches / offset_checks, 6) if offset_checks else None,
        "display_offset_match_rate": 1.0,
        "curation_files": ["topic_label_curation.tsv", "hierarchy_label_curation.tsv"],
    }
    (destination / "dataset_metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2))


def parse_args() -> argparse.Namespace:
    workspace = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export-dir", type=Path, default=workspace / "flowsight-etl/outputs/hm_topic_modeling/bertopic_200626_min4/bertip_export")
    parser.add_argument("--messages", type=Path, default=workspace / "outputs/hm_topic_modeling/telegram_hm_messages_topic_modeling.tsv")
    parser.add_argument("--destination", type=Path, default=workspace / "flowsight/flowsight/db/datasets/bertopic/sudan_hm_min4")
    parser.add_argument("--labels", type=Path, default=workspace / "flowsight/flowsight/db/datasets/bertopic/sudan_hm_min4_labels.tsv")
    parser.add_argument("--replace", action="store_true", help="Replace an existing generated data bundle.")
    return parser.parse_args()


if __name__ == "__main__":
    build(parse_args())
