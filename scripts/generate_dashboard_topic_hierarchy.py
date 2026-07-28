#!/usr/bin/env python3
"""Create the curated three-level hierarchy used by the Topic Explorer.

BERTopic's native hierarchy is retained in each bundle for provenance, but it
is a word-distribution dendrogram and can merge semantically unrelated topics
through recurring channel boilerplate.  This script groups its already
reviewed topic families into broad dashboard families, then preserves every
individual BERTopic topic as the leaf level.
"""
from __future__ import annotations

import csv
from pathlib import Path


HIERARCHIES = {
    "telegram": [
        ("conversation", "News, media and community conversation", {"554", "550", "533", "317", "501"}),
        ("governance", "Government, public services, economy and education", {"543", "510", "551", "558", "569"}),
        ("conflict", "Conflict, security and foreign relations", {"547", "541", "552", "549"}),
        ("humanitarian", "Humanitarian conditions, refugees and migration", {"537", "560"}),
        ("weather", "Weather, floods and climate", {"546"}),
    ],
    "mediacloud": [
        ("conflict", "El Fasher and armed conflict", {"69"}),
        ("humanitarian", "Humanitarian conditions, health and refugees", {"95", "94", "99"}),
        ("migration", "Migration, migrant journeys and trafficking", {"72", "77", "101"}),
        ("public", "Education and public services", {"85"}),
        ("diaspora", "Diaspora and political marginalisation", {"93"}),
    ],
}


def read_tsv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


def write_tsv(path: Path, rows: list[dict[str, str]]) -> None:
    fields = ["topic_id", "broad_id", "broad_label", "subfamily_id", "subfamily_label"]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, delimiter="\t")
        writer.writeheader()
        writer.writerows(rows)


def create(source: str, bundle: Path) -> None:
    assignments = read_tsv(bundle / "topic_families.tsv")
    labels = {row["family_id"]: row["family_label"] for row in read_tsv(bundle / "topic_family_labels.tsv")}
    family_to_broad = {
        family_id: (broad_id, broad_label)
        for broad_id, broad_label, family_ids in HIERARCHIES[source]
        for family_id in family_ids
    }
    missing = sorted({row["family_id"] for row in assignments} - set(family_to_broad))
    if missing:
        raise ValueError(f"{source}: topic families missing a dashboard family: {', '.join(missing)}")
    rows = []
    for row in assignments:
        broad_id, broad_label = family_to_broad[row["family_id"]]
        rows.append({
            "topic_id": row["topic_id"],
            "broad_id": broad_id,
            "broad_label": broad_label,
            "subfamily_id": row["family_id"],
            "subfamily_label": labels[row["family_id"]],
        })
    write_tsv(bundle / "dashboard_topic_hierarchy.tsv", sorted(rows, key=lambda row: int(row["topic_id"])))


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1] / "flowsight" / "db" / "datasets" / "bertopic"
    create("telegram", root / "sudan_hm_min4")
    create("mediacloud", root / "mediacloud_run_02_bertopic_1")
