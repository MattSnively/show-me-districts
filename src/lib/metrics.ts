/**
 * metrics.ts — Redistricting fairness metric calculations.
 * Implements Polsby-Popper compactness, Reock compactness, population deviation,
 * and efficiency gap. All calculations run client-side using Turf.js.
 */

import * as turf from '@turf/turf';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

/**
 * Computes the Polsby-Popper compactness score for a district polygon.
 * Score = (4 * PI * area) / perimeter^2. Range: 0 (elongated) to 1 (circle).
 * @param feature - GeoJSON Polygon or MultiPolygon feature
 * @returns Polsby-Popper score between 0 and 1
 */
export function polsbyPopper(feature: Feature<Polygon | MultiPolygon>): number {
  const area = turf.area(feature);
  const perimeter = turf.length(turf.polygonToLine(feature), { units: 'meters' });

  if (perimeter === 0) return 0;
  return (4 * Math.PI * area) / (perimeter * perimeter);
}

/**
 * Computes the Reock compactness score for a district polygon.
 * Score = area / area of minimum bounding circle. Range: 0 to 1.
 * @param feature - GeoJSON Polygon or MultiPolygon feature
 * @returns Reock score between 0 and 1
 */
export function reock(feature: Feature<Polygon | MultiPolygon>): number {
  const area = turf.area(feature);
  const circle = turf.circle(
    turf.center(feature),
    turf.length(turf.polygonToLine(turf.bboxPolygon(turf.bbox(feature))), { units: 'kilometers' }) / 2,
    { units: 'kilometers' }
  );
  const circleArea = turf.area(circle);

  if (circleArea === 0) return 0;
  return area / circleArea;
}

/**
 * Computes population deviation for a set of districts.
 * Returns the maximum deviation from the ideal population (total / numDistricts).
 * @param districtPopulations - Array of population counts, one per district
 * @returns Maximum percent deviation from ideal (e.g., 0.05 = 5%)
 */
export function populationDeviation(districtPopulations: number[]): number {
  if (districtPopulations.length === 0) return 0;

  const total = districtPopulations.reduce((a, b) => a + b, 0);
  const ideal = total / districtPopulations.length;

  if (ideal === 0) return 0;

  /* Find the maximum absolute percent deviation from ideal */
  return Math.max(
    ...districtPopulations.map((pop) => Math.abs(pop - ideal) / ideal)
  );
}

/**
 * Computes the efficiency gap between two parties across all districts.
 * Measures the difference in "wasted votes" as a fraction of total votes.
 * Positive = advantage for party A (typically Republican in our data).
 * @param districts - Array of { partyAVotes, partyBVotes } for each district
 * @returns Efficiency gap as a decimal (e.g., 0.08 = 8% gap)
 */
export function efficiencyGap(
  districts: Array<{ partyAVotes: number; partyBVotes: number }>
): number {
  let wastedA = 0;
  let wastedB = 0;
  let totalVotes = 0;

  for (const d of districts) {
    const total = d.partyAVotes + d.partyBVotes;
    totalVotes += total;
    const threshold = Math.floor(total / 2) + 1;

    if (d.partyAVotes > d.partyBVotes) {
      /* Party A wins: A wastes votes above threshold, B wastes all */
      wastedA += d.partyAVotes - threshold;
      wastedB += d.partyBVotes;
    } else {
      /* Party B wins: B wastes votes above threshold, A wastes all */
      wastedB += d.partyBVotes - threshold;
      wastedA += d.partyAVotes;
    }
  }

  if (totalVotes === 0) return 0;
  return (wastedA - wastedB) / totalVotes;
}

/**
 * Computes the mean-median difference for a party's vote share across districts.
 * A large positive value suggests the party's votes are "packed" into fewer districts.
 * @param voteShares - Array of party vote share per district (0 to 1)
 * @returns Mean minus median vote share
 */
export function meanMedianDifference(voteShares: number[]): number {
  if (voteShares.length === 0) return 0;

  const mean = voteShares.reduce((a, b) => a + b, 0) / voteShares.length;
  const sorted = [...voteShares].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

  return mean - median;
}
