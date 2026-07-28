#!/usr/bin/env python3
"""Copy and normalize the selected MediaCloud BERTopic run for FlowSight.

Unlike Telegram, this model treats one story title as one document, so every
story has exactly one BERTopic assignment (or the -1 outlier assignment).
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
from collections import defaultdict
from pathlib import Path


EXPORT_FILES = (
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


def fallback_label(raw_name: str, topic_id: str) -> str:
    name = re.sub(rf"^{re.escape(topic_id)}_", "", raw_name).replace("_", " · ").strip()
    return name.title() if name else f"Topic {topic_id}"


def load_labels(path: Path) -> tuple[dict[str, str], dict[str, str]]:
    if not path.exists():
        return {}, {}
    rows = read_tsv(path)
    return (
        {row["topic_id"]: row["display_label"] for row in rows if row.get("topic_id") and row.get("display_label")},
        {row["parent_id"]: row["display_label"] for row in rows if row.get("parent_id") and row.get("display_label")},
    )


def build(args: argparse.Namespace) -> None:
    export_dir = args.export_dir.resolve()
    destination = args.destination.resolve()
    missing = [name for name in EXPORT_FILES if not (export_dir / name).is_file()]
    if missing:
        raise SystemExit(f"Missing required BERTopic export files: {', '.join(missing)}")
    if destination.exists() and any(destination.iterdir()) and not args.replace:
        raise SystemExit(f"Destination already contains data: {destination}. Use --replace to rebuild it.")
    if args.replace and destination.exists():
        shutil.rmtree(destination)

    raw_destination = destination / "raw_export"
    raw_destination.mkdir(parents=True, exist_ok=True)
    for name in EXPORT_FILES:
        shutil.copy2(export_dir / name, raw_destination / name)

    topic_labels, hierarchy_labels = load_labels(args.labels)
    classifications = read_tsv(export_dir / "classification.tsv")
    stories = []
    topic_samples: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in classifications:
        stories.append(
            {
                "story_id": row["id"],
                "topic_id": row["topic_id"],
                "title_en": row["chunk_text"],
                "title_original": row["title"],
                "body_en": row["body_en"],
                "media_name": row["media_name"],
                "media_url": row["media_url"],
                "url": row["url"],
                "language": row["language"],
                "publish_date": row["publish_date"],
            }
        )
        if row["topic_id"] != "-1" and len(topic_samples[row["topic_id"]]) < 3:
            topic_samples[row["topic_id"]].append(row)
    if len({row["story_id"] for row in stories}) != len(stories):
        raise SystemExit("Expected one unique MediaCloud story per BERTopic classification row.")
    write_tsv(
        destination / "mediacloud_stories.tsv",
        ["story_id", "topic_id", "title_en", "title_original", "body_en", "media_name", "media_url", "url", "language", "publish_date"],
        stories,
    )

    topics_info = [row for row in read_tsv(export_dir / "topics_info.tsv") if row["Topic"] != "-1"]
    topic_rows = []
    curation_rows = []
    for row in topics_info:
        topic_id = row["Topic"]
        samples = topic_samples.get(topic_id, [])
        topic_rows.append(
            {
                "topic_id": topic_id,
                "display_label": topic_labels.get(topic_id, fallback_label(row["Name"], topic_id)),
                "raw_name": row["Name"],
                "keywords": row["Representation"],
                "story_count": row["Count"],
                "label_status": "reviewed" if topic_id in topic_labels else "needs_review",
            }
        )
        curation_rows.append(
            {
                "topic_id": topic_id,
                "display_label": topic_labels.get(topic_id, ""),
                "raw_name": row["Name"],
                "keywords": row["Representation"],
                "representative_title_1": samples[0]["chunk_text"] if len(samples) > 0 else "",
                "representative_title_2": samples[1]["chunk_text"] if len(samples) > 1 else "",
                "representative_title_3": samples[2]["chunk_text"] if len(samples) > 2 else "",
            }
        )
    write_tsv(destination / "mediacloud_topics.tsv", ["topic_id", "display_label", "raw_name", "keywords", "story_count", "label_status"], topic_rows)
    write_tsv(destination / "topic_label_curation.tsv", list(curation_rows[0].keys()), curation_rows)

    hierarchy_rows = read_tsv(export_dir / "hierarchical_topics.tsv")
    hierarchy_output = []
    hierarchy_curation = []
    for row in hierarchy_rows:
        parent_id = row["Parent_ID"]
        hierarchy_output.append({**row, "display_label": hierarchy_labels.get(parent_id, fallback_label(row["Parent_Name"], parent_id)), "label_status": "reviewed" if parent_id in hierarchy_labels else "needs_review"})
        hierarchy_curation.append({"parent_id": parent_id, "display_label": hierarchy_labels.get(parent_id, ""), "raw_name": row["Parent_Name"], "topic_ids": row["Topics"]})
    write_tsv(destination / "mediacloud_topic_hierarchy.tsv", list(hierarchy_rows[0].keys()) + ["display_label", "label_status"], hierarchy_output)
    write_tsv(destination / "hierarchy_label_curation.tsv", list(hierarchy_curation[0].keys()), hierarchy_curation)

    metadata = {
        "model_run": "mediacloud_run_02_bertopic_1",
        "source": "mediacloud",
        "assignment_semantics": "one topic assignment per story title; -1 denotes an outlier story",
        "story_count": len(stories),
        "topic_count": len(topics_info),
        "outlier_story_count": sum(row["topic_id"] == "-1" for row in stories),
        "curation_files": ["topic_label_curation.tsv", "hierarchy_label_curation.tsv"],
    }
    (destination / "dataset_metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2))


def parse_args() -> argparse.Namespace:
    workspace = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export-dir", type=Path, default=workspace / "flowsight-etl/outputs/mediacloud_bertopic/run_02/bertopic_1/bertip_export")
    parser.add_argument("--destination", type=Path, default=workspace / "flowsight/flowsight/db/datasets/bertopic/mediacloud_run_02_bertopic_1")
    parser.add_argument("--labels", type=Path, default=workspace / "flowsight/flowsight/db/datasets/bertopic/mediacloud_run_02_bertopic_1_labels.tsv")
    parser.add_argument("--replace", action="store_true", help="Replace an existing generated data bundle.")
    return parser.parse_args()


if __name__ == "__main__":
    build(parse_args())
