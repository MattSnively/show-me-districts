/**
 * map-utils.ts — GeoJSON helpers, color scales, and map utility functions.
 * Used by all three Svelte map components for consistent rendering.
 */

import type { FeatureCollection, Feature } from 'geojson';

/**
 * Color palette for 8 congressional districts.
 * Chosen for colorblind accessibility (diverging palette with distinct hues).
 */
export const DISTRICT_COLORS: string[] = [
  '#1f77b4', // steel blue
  '#ff7f0e', // orange
  '#2ca02c', // green
  '#d62728', // red
  '#9467bd', // purple
  '#8c564b', // brown
  '#e377c2', // pink
  '#17becf', // teal
];

/** Number of congressional districts in Missouri (current) */
export const MO_DISTRICT_COUNT = 8;

/** Missouri approximate bounding box [west, south, east, north] */
export const MO_BOUNDS: [number, number, number, number] = [
  -95.7747, 35.9957, -89.0989, 40.6136,
];

/** Missouri center coordinates [lng, lat] for map initialization */
export const MO_CENTER: [number, number] = [-92.4368, 38.3047];

/**
 * Returns a red-blue interpolated color based on partisan margin.
 * Negative margin = Democratic (blue), positive = Republican (red).
 * @param margin - Vote margin as a decimal (-1 to 1). Negative = Dem, positive = Rep.
 * @returns Hex color string
 */
export function partisanColor(margin: number): string {
  /* Clamp margin to [-1, 1] */
  const clamped = Math.max(-1, Math.min(1, margin));

  /* Normalize to 0–1 range where 0 = full Dem, 1 = full Rep */
  const t = (clamped + 1) / 2;

  /* Interpolate between blue (#2563EB) and red (#DC2626) */
  const r = Math.round(37 + t * (220 - 37));
  const g = Math.round(99 + t * (38 - 99));
  const b = Math.round(235 + t * (38 - 235));

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Counts the total population across all features in a FeatureCollection.
 * Expects each feature to have a `population` property.
 * @param fc - GeoJSON FeatureCollection with population properties
 * @returns Total population
 */
export function totalPopulation(fc: FeatureCollection): number {
  return fc.features.reduce((sum: number, f: Feature) => {
    return sum + (Number(f.properties?.population) || 0);
  }, 0);
}

/**
 * Groups features by their `district` property value.
 * Used by the editor and metrics components to analyze per-district statistics.
 * @param fc - GeoJSON FeatureCollection with district assignments
 * @returns Map of district number to array of features
 */
export function groupByDistrict(fc: FeatureCollection): Map<number, Feature[]> {
  const groups = new Map<number, Feature[]>();

  for (const feature of fc.features) {
    const district = Number(feature.properties?.district) || 0;
    if (!groups.has(district)) {
      groups.set(district, []);
    }
    groups.get(district)!.push(feature);
  }

  return groups;
}
