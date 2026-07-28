#!/usr/bin/env python3
"""Create topic families by clustering BERTopic semantic embeddings.

The hierarchy used for the dashboard is a flat cut of an agglomerative tree.
Topic embeddings are compared with cosine distance; labels are transparent,
automatic descriptions based on the most central, high-volume member topics.
"""
from __future__ import annotations

import argparse
import csv
from collections import Counter
from pathlib import Path

import numpy as np
from safetensors.numpy import load_file
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics.pairwise import cosine_similarity


def read_tsv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


def write_tsv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, delimiter="\t")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--topics", required=True, type=Path)
    parser.add_argument("--families-output", required=True, type=Path)
    parser.add_argument("--labels-output", required=True, type=Path)
    parser.add_argument("--clusters", required=True, type=int)
    parser.add_argument("--linkage", choices=("average", "complete"), default="complete")
    args = parser.parse_args()

    topics = sorted(read_tsv(args.topics), key=lambda row: int(row["topic_id"]))
    embeddings = load_file(args.model)["topic_embeddings"]
    if embeddings.shape[0] != len(topics) + 1:
        raise SystemExit(f"Expected outlier plus {len(topics)} topic vectors; got {embeddings.shape[0]}.")
    vectors = embeddings[1:].astype(np.float64, copy=False)
    if not 1 < args.clusters <= len(topics):
        raise SystemExit("--clusters must be between 2 and the number of topics.")

    # Complete linkage prevents one large chain of loosely related topics from
    # swallowing the whole tree. It also works directly with cosine distance.
    try:
        cluster_ids = AgglomerativeClustering(
            n_clusters=args.clusters, metric="cosine", linkage=args.linkage
        ).fit_predict(vectors)
    except TypeError:  # scikit-learn < 1.2
        cluster_ids = AgglomerativeClustering(
            n_clusters=args.clusters, affinity="cosine", linkage=args.linkage
        ).fit_predict(vectors)

    count_field = "chunk_count" if "chunk_count" in topics[0] else "story_count"
    members: dict[int, list[int]] = {}
    for index, cluster_id in enumerate(cluster_ids):
        members.setdefault(int(cluster_id), []).append(index)

    # Make IDs stable and meaningful in the UI: largest semantic family first.
    ordered_clusters = sorted(
        members,
        key=lambda cluster_id: (-sum(int(topics[index][count_field]) for index in members[cluster_id]), cluster_id),
    )
    family_ids = {cluster_id: str(position + 1) for position, cluster_id in enumerate(ordered_clusters)}
    labels: list[dict[str, str]] = []
    assignments: list[dict[str, str]] = []
    for cluster_id in ordered_clusters:
        indices = members[cluster_id]
        cluster_vectors = vectors[indices]
        centroid = cluster_vectors.mean(axis=0, keepdims=True)
        centrality = cosine_similarity(cluster_vectors, centroid).ravel()
        # Prefer central topics, breaking close scores with actual prevalence.
        representative_indices = sorted(
            indices,
            key=lambda index: (
                -round(float(centrality[indices.index(index)]), 8),
                -int(topics[index][count_field]),
                int(topics[index]["topic_id"]),
            ),
        )[:2]
        representative_labels = [topics[index]["display_label"] for index in representative_indices]
        family_label = " · ".join(representative_labels)
        family_id = family_ids[cluster_id]
        labels.append({
            "family_id": family_id,
            "family_label": family_label,
            "representative_topics": " | ".join(representative_labels),
            "topic_count": str(len(indices)),
            "assignment_volume": str(sum(int(topics[index][count_field]) for index in indices)),
        })
        for index in indices:
            assignments.append({
                "topic_id": topics[index]["topic_id"],
                "family_id": family_id,
                "family_label": family_label,
            })

    assignments.sort(key=lambda row: int(row["topic_id"]))
    write_tsv(args.families_output, ["topic_id", "family_id", "family_label"], assignments)
    write_tsv(
        args.labels_output,
        ["family_id", "family_label", "representative_topics", "topic_count", "assignment_volume"],
        labels,
    )


if __name__ == "__main__":
    main()
