/**
 * election-data.ts — Utilities to load and join election results onto GeoJSON features.
 * Handles the mapping between congress/district numbers and vote totals.
 */

import type { FeatureCollection, Feature } from 'geojson';

/** Structure for a single district's election result */
export interface ElectionResult {
  year: number;
  district: number;
  candidates: Array<{
    name: string;
    party: string;
    votes: number;
    winner: boolean;
  }>;
  totalVotes: number;
  margin: number; // positive = Republican win, negative = Democratic win
}

/** Structure for election data keyed by congress number, then district */
export type ElectionDataset = Record<number, Record<number, ElectionResult>>;

/**
 * Loads election data JSON from the /data/elections/ directory.
 * @param congressNumber - The congress number (e.g., 118 for 2023-2025)
 * @returns Election results keyed by district number
 */
export async function loadElectionData(
  congressNumber: number
): Promise<Record<number, ElectionResult> | null> {
  try {
    /* Dynamic import for election data JSON files */
    const data = await import(`../../data/elections/congress-${congressNumber}.json`);
    return data.default as Record<number, ElectionResult>;
  } catch {
    /* Expected for congress numbers without compiled election data */
    return null;
  }
}

/**
 * Joins election results onto a GeoJSON FeatureCollection.
 * Adds `electionResult` and `margin` properties to each matching feature.
 * @param fc - District boundaries FeatureCollection
 * @param elections - Election results keyed by district number
 * @returns New FeatureCollection with election data attached to feature properties
 */
export function joinElectionData(
  fc: FeatureCollection,
  elections: Record<number, ElectionResult>
): FeatureCollection {
  const features: Feature[] = fc.features.map((feature) => {
    const districtNum = Number(feature.properties?.district || feature.properties?.CD || 0);
    const result = elections[districtNum] || null;

    return {
      ...feature,
      properties: {
        ...feature.properties,
        electionResult: result,
        margin: result?.margin ?? null,
      },
    };
  });

  return { type: 'FeatureCollection', features };
}
