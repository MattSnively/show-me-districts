/**
 * extract-missouri.js — Builds per-congress GeoJSON files from the UCLA
 * Missouri range files downloaded by download-historical.js.
 *
 * UCLA files cover congress ranges (e.g., Missouri_022_to_073.geojson contains
 * districts valid for congresses 22 through 73). To reconstruct what Missouri
 * looked like for a specific congress, we merge all features whose
 * [startcong, endcong] range includes that congress number.
 *
 * Usage: node scripts/extract-missouri.js
 * Input:  data/historical/raw/ (downloaded UCLA files)
 * Output: data/historical/congress-{NNN}.geojson (one file per congress)
 *
 * Phase 1a data pipeline script — not shipped to production.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';

const RAW_DIR = 'data/historical/raw';
const OUTPUT_DIR = 'data/historical';

/** Missouri's first congress (admitted 1821) through current */
const FIRST_CONGRESS = 17;
const LAST_CONGRESS = 119;

/**
 * Parses a UCLA range filename to extract start and end congress numbers.
 * Format: "Missouri_017_to_021.geojson" → { start: 17, end: 21 }
 */
function parseRange(filename) {
  const match = filename.match(/Missouri_(\d+)_to_(\d+)/);
  if (!match) return null;
  return { start: parseInt(match[1], 10), end: parseInt(match[2], 10) };
}

/**
 * Loads all raw Missouri GeoJSON files and indexes their features by
 * the congress range each feature is valid for.
 * Returns an array of { startcong, endcong, feature } entries.
 */
function loadAllFeatures() {
  const files = readdirSync(RAW_DIR).filter((f) => f.endsWith('.geojson'));
  const allFeatures = [];

  for (const file of files) {
    const raw = readFileSync(join(RAW_DIR, file), 'utf-8');
    const geojson = JSON.parse(raw);

    for (const feature of geojson.features) {
      const props = feature.properties || {};
      /* Use feature-level congress range (more precise than filename range) */
      const startcong = parseInt(props.startcong, 10);
      const endcong = parseInt(props.endcong, 10);

      if (!isNaN(startcong) && !isNaN(endcong)) {
        allFeatures.push({ startcong, endcong, feature });
      }
    }
  }

  console.log(`Loaded ${allFeatures.length} total features from ${files.length} files\n`);
  return allFeatures;
}

/**
 * For a given congress number, collects all features whose range includes it.
 * Returns a GeoJSON FeatureCollection with congress metadata.
 */
function buildCongressGeoJSON(congressNum, allFeatures) {
  const matching = allFeatures
    .filter((entry) => entry.startcong <= congressNum && entry.endcong >= congressNum)
    .map((entry) => ({
      ...entry.feature,
      properties: {
        ...entry.feature.properties,
        /* Normalize district number for consistent access */
        districtNum: parseInt(entry.feature.properties?.district, 10) || 0,
      },
    }));

  return {
    type: 'FeatureCollection',
    properties: {
      state: 'Missouri',
      congress: congressNum,
      districtCount: matching.length,
    },
    features: matching,
  };
}

/* Main execution */
function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const allFeatures = loadAllFeatures();
  let fileCount = 0;
  let emptyCount = 0;

  for (let congress = FIRST_CONGRESS; congress <= LAST_CONGRESS; congress++) {
    const geojson = buildCongressGeoJSON(congress, allFeatures);

    if (geojson.features.length === 0) {
      emptyCount++;
      continue;
    }

    const filename = `congress-${String(congress).padStart(3, '0')}.geojson`;
    const outPath = join(OUTPUT_DIR, filename);
    writeFileSync(outPath, JSON.stringify(geojson));
    fileCount++;

    console.log(
      `  ${filename}: ${geojson.features.length} districts`
    );
  }

  console.log(`\nWrote ${fileCount} congress files (${emptyCount} empty congresses skipped)`);
}

main();
