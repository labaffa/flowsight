#!/usr/bin/env python3
"""Group topics into compact, visible neighbourhoods in a 3D UMAP map."""
from __future__ import annotations

import argparse
import csv
from pathlib import Path

import numpy as np
from sklearn.cluster import AgglomerativeClustering
from sklearn.neighbors import kneighbors_graph
from sklearn.preprocessing import StandardScaler


def read_tsv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--topics", required=True, type=Path)
    parser.add_argument("--coordinates", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--clusters", required=True, type=int)
    parser.add_argument("--upper-clusters", required=True, type=int)
    args = parser.parse_args()

    topics = {row["topic_id"]: row for row in read_tsv(args.topics)}
    coordinates = sorted(read_tsv(args.coordinates), key=lambda row: int(row["topic_id"]))
    if not 1 < args.clusters <= len(coordinates):
        raise SystemExit("--clusters must be between 2 and the number of mapped topics.")
    if not 1 < args.upper_clusters < args.clusters:
        raise SystemExit("--upper-clusters must be between 2 and --clusters - 1.")

    positions = np.array([[float(row[axis]) for axis in ("x", "y", "z")] for row in coordinates])
    # UMAP axes have arbitrary orientation and scale. Standardising them means
    # compactness is judged equally in every displayed direction.
    standardized_positions = StandardScaler().fit_transform(positions)
    labels = AgglomerativeClustering(n_clusters=args.clusters, linkage="ward").fit_predict(standardized_positions)
    count_field = "chunk_count" if "chunk_count" in next(iter(topics.values())) else "story_count"
    members: dict[int, list[int]] = {}
    for index, label in enumerate(labels):
        members.setdefault(int(label), []).append(index)

    ordered = sorted(
        members,
        key=lambda label: (-sum(int(topics[coordinates[index]["topic_id"]][count_field]) for index in members[label]), label),
    )
    display_ids = {label: str(index + 1) for index, label in enumerate(ordered)}
    # The parent level groups the already-established visible neighbourhoods,
    # never individual topics. This preserves the map's local clusters and
    # avoids a broad parent swallowing a spatially disconnected set of topics.
    cluster_centroids = np.array([standardized_positions[members[label]].mean(axis=0) for label in ordered])
    cluster_positions = StandardScaler().fit_transform(cluster_centroids)
    connectivity = kneighbors_graph(
        cluster_positions,
        n_neighbors=min(2, len(ordered) - 1),
        mode="connectivity",
        include_self=False,
    )
    upper_by_cluster = AgglomerativeClustering(
        n_clusters=args.upper_clusters,
        linkage="ward",
        connectivity=connectivity,
    ).fit_predict(cluster_positions)
    upper_members: dict[int, list[int]] = {}
    for cluster_label, upper_label in zip(ordered, upper_by_cluster):
        upper_members.setdefault(int(upper_label), []).extend(members[cluster_label])
    ordered_upper = sorted(
        upper_members,
        key=lambda label: (-sum(int(topics[coordinates[index]["topic_id"]][count_field]) for index in upper_members[label]), label),
    )
    upper_display_ids = {label: str(index + 1) for index, label in enumerate(ordered_upper)}
    upper_names: dict[int, str] = {}
    for label in ordered_upper:
        upper_names[label] = f"Map region {upper_display_ids[label]}"
    output_rows: list[dict[str, str]] = []
    for label in ordered:
        indices = members[label]
        centroid = positions[indices].mean(axis=0)
        # A legend should name the subjects users encounter most often in a
        # neighbourhood; central but tiny topics tend to produce opaque labels.
        representatives = sorted(
            indices,
            key=lambda index: (
                -int(topics[coordinates[index]["topic_id"]][count_field]),
                float(np.linalg.norm(positions[index] - centroid)),
            ),
        )[:2]
        representative_labels = [topics[coordinates[index]["topic_id"]]["display_label"] for index in representatives]
        neighbourhood_label = " · ".join(representative_labels)
        for index in indices:
            output_rows.append({
                "topic_id": coordinates[index]["topic_id"],
                "supercluster_id": upper_display_ids[int(upper_by_cluster[ordered.index(label)])],
                "supercluster_label": upper_names[int(upper_by_cluster[ordered.index(label)])],
                "family_id": display_ids[label],
                "family_label": neighbourhood_label,
            })

    output_rows.sort(key=lambda row: int(row["topic_id"]))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["topic_id", "supercluster_id", "supercluster_label", "family_id", "family_label"], delimiter="\t")
        writer.writeheader()
        writer.writerows(output_rows)


if __name__ == "__main__":
    main()
