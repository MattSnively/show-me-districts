"""
generate-fair-maps.py — Generates an ensemble of district plans using GerryChain.
Produces GeoJSON output files with metric scores for each plan.

Usage: python scripts/generate-fair-maps.py --input data/census/mo-tracts-2020.geojson --output data/fair-maps/

Phase 2 / v2 script — not needed for initial launch (curated maps are used instead).
Requires: gerrychain, geopandas, shapely
"""

# Placeholder — GerryChain implementation deferred to Phase 6 per plan.
# This file documents the intended interface for when the script is built.

import argparse
import json
import sys


def main():
    """Entry point for fair map generation."""
    parser = argparse.ArgumentParser(description="Generate fair district plans for Missouri")
    parser.add_argument("--input", required=True, help="Path to census tracts GeoJSON")
    parser.add_argument("--output", required=True, help="Output directory for generated plans")
    parser.add_argument("--num-plans", type=int, default=1000, help="Number of plans to generate")
    parser.add_argument("--num-districts", type=int, default=8, help="Number of districts")
    parser.add_argument("--steps", type=int, default=10000, help="ReCom chain steps per plan")
    args = parser.parse_args()

    print(f"GerryChain ensemble generation — deferred to v2")
    print(f"  Input: {args.input}")
    print(f"  Output: {args.output}")
    print(f"  Plans: {args.num_plans}")
    print(f"  Districts: {args.num_districts}")
    print(f"  Steps: {args.steps}")
    print()
    print("This script is a placeholder. To implement:")
    print("  1. pip install gerrychain geopandas")
    print("  2. Load tract graph from input GeoJSON")
    print("  3. Run ReCom Markov chain to generate ensemble")
    print("  4. Score each plan on compactness, pop deviation, efficiency gap")
    print("  5. Export top-N plans as GeoJSON + metadata")
    sys.exit(0)


if __name__ == "__main__":
    main()
