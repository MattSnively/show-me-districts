"""
join-pl94171-to-tracts.py — Replaces the land-area population estimates in the tract
GeoJSON with real 2020 Census PL 94-171 counts.

Usage:
  1. Download and unzip the Missouri legacy-format file into data/pl94171/:
     https://www2.census.gov/programs-surveys/decennial/2020/data/01-Redistricting_File--PL_94-171/Missouri/mo2020.pl.zip
     (The Census API now requires a key; the bulk file does not.)
  2. python -I scripts/join-pl94171-to-tracts.py

Reads:  data/pl94171/mogeo2020.pl   (geographic header: maps LOGRECNO -> tract GEOID)
        data/pl94171/mo000012020.pl (P1: total population)
        data/pl94171/mo000022020.pl (P3: population 18 and over)
Writes: data/census/mo-tracts-2020.geojson and its public/ copy, in place.

Run this BEFORE join-election-to-tracts.cjs only if tracts are regenerated; it preserves
the election fields already on each feature, so order does not matter otherwise.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PL_DIR = ROOT / "data" / "pl94171"
TARGETS = [
    ROOT / "data" / "census" / "mo-tracts-2020.geojson",
    ROOT / "public" / "data" / "census" / "mo-tracts-2020.geojson",
]

# Field positions in the legacy PL 94-171 pipe-delimited layout. Fields 0-4 are
# FILEID/STUSAB/CHARITER/CIFSN/LOGRECNO; the first data column of each segment follows.
GEO_SUMLEV, GEO_LOGRECNO, GEO_GEOID = 2, 7, 8
SEG_LOGRECNO, SEG_FIRST_DATA = 4, 5
SUMLEV_TRACT = "140"


def read_tract_logrecnos() -> dict[str, str]:
    """Maps LOGRECNO -> 11-digit tract GEOID for every tract (summary level 140) row."""
    out = {}
    with open(PL_DIR / "mogeo2020.pl", encoding="latin-1") as f:
        for line in f:
            parts = line.split("|")
            if parts[GEO_SUMLEV] == SUMLEV_TRACT:
                # GEOID looks like "1400000US29001950100"; the tract GEOID is the part after "US".
                out[parts[GEO_LOGRECNO]] = parts[GEO_GEOID].split("US")[1]
    return out


def read_first_column(filename: str, tracts: dict[str, str]) -> dict[str, int]:
    """Reads the first data column (P1_001N or P3_001N) of a segment file for the tract rows."""
    out = {}
    with open(PL_DIR / filename, encoding="latin-1") as f:
        for line in f:
            parts = line.split("|")
            geoid = tracts.get(parts[SEG_LOGRECNO])
            if geoid:
                out[geoid] = int(parts[SEG_FIRST_DATA])
    return out


def main() -> None:
    tracts = read_tract_logrecnos()
    pop = read_first_column("mo000012020.pl", tracts)
    vap = read_first_column("mo000022020.pl", tracts)
    print(f"PL 94-171 tracts: {len(tracts)}; total population {sum(pop.values()):,}; 18+ {sum(vap.values()):,}")

    for path in TARGETS:
        data = json.loads(path.read_text(encoding="utf-8"))
        matched = 0
        missing = []
        for feat in data["features"]:
            props = feat["properties"]
            geoid = props["geoid"]
            if geoid in pop:
                props["population"] = pop[geoid]
                props["vap"] = vap[geoid]
                props["populationSource"] = "pl94171"
                matched += 1
            else:
                missing.append(geoid)

        total = sum(f["properties"]["population"] for f in data["features"])
        data.setdefault("properties", {})
        data["properties"]["totalPopulation"] = total
        data["properties"]["source"] = "Census TIGER/Line 2020 + PL 94-171 (2020)"
        data["properties"].pop("populationNote", None)

        # Tracts present in the PL file but absent from the geometry would silently lose people.
        unused = set(pop) - {f["properties"]["geoid"] for f in data["features"]}
        pop_unused = sum(pop[g] for g in unused)
        print(f"{path.relative_to(ROOT)}: matched {matched}/{len(data['features'])}, "
              f"missing {len(missing)}, PL tracts with no geometry {len(unused)} (pop {pop_unused:,}), "
              f"new total {total:,}")
        if missing:
            print("  missing GEOIDs:", missing[:10])

        path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
