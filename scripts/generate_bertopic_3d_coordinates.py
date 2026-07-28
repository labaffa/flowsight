#!/usr/bin/env python3
"""Create deterministic 3D UMAP coordinates for a FlowSight BERTopic bundle."""
from __future__ import annotations

import argparse
import csv
from pathlib import Path

import umap
from safetensors.numpy import load_file


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--topics", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--n-neighbors", type=int, default=15)
    parser.add_argument("--min-dist", type=float, default=0.0)
    parser.add_argument("--random-state", type=int, default=42)
    args = parser.parse_args()
    with args.topics.open(encoding="utf-8", newline="") as handle:
        topics = list(csv.DictReader(handle, delimiter="\t"))
    topics.sort(key=lambda row: int(row["topic_id"]))
    vectors = load_file(args.model)["topic_embeddings"]
    if vectors.shape[0] != len(topics) + 1:
        raise SystemExit(f"Expected outlier plus {len(topics)} topic vectors; got {vectors.shape[0]}.")
    projection = umap.UMAP(
        n_components=3,
        metric="cosine",
        n_neighbors=args.n_neighbors,
        min_dist=args.min_dist,
        random_state=args.random_state,
    ).fit_transform(vectors[1:])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["topic_id", "x", "y", "z"], delimiter="\t")
        writer.writeheader()
        for topic, point in zip(topics, projection, strict=True):
            writer.writerow({"topic_id": topic["topic_id"], "x": point[0], "y": point[1], "z": point[2]})


if __name__ == "__main__":
    main()
