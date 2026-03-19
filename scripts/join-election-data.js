/**
 * join-election-data.js — Merges election results from data/elections/ onto
 * the simplified per-congress GeoJSON files in data/historical/simplified/.
 *
 * For each congress that has election data, reads the election JSON file,
 * matches districts by number, and writes the combined result back to the
 * simplified GeoJSON. This allows the frontend to render choropleth colors
 * without a second data fetch.
 *
 * Usage: node scripts/join-election-data.js
 * Input:  data/historical/simplified/congress-*.geojson + data/elections/congress-*.json
 * Output: Updated simplified GeoJSON files with election data in feature properties
 *
 * Phase 1b data pipeline script — not shipped to production.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const SIMPLIFIED_DIR = 'data/historical/simplified';
const ELECTIONS_DIR = 'data/elections';

/* Load election index to know which congresses have data */
const indexPath = join(ELECTIONS_DIR, 'election-index.json');
if (!existsSync(indexPath)) {
  console.error('Election index not found. Create data/elections/election-index.json first.');
  process.exit(1);
}

const electionIndex = JSON.parse(readFileSync(indexPath, 'utf-8'));
console.log(`Found ${electionIndex.elections.length} election datasets\n`);

let joined = 0;
let skipped = 0;

for (const entry of electionIndex.elections) {
  const congressNum = entry.congress;
  const congressFile = `congress-${String(congressNum).padStart(3, '0')}.geojson`;
  const geoPath = join(SIMPLIFIED_DIR, congressFile);
  const electionPath = join(ELECTIONS_DIR, entry.file);

  /* Skip if simplified GeoJSON doesn't exist */
  if (!existsSync(geoPath)) {
    console.log(`  [skip] ${congressFile}: simplified GeoJSON not found`);
    skipped++;
    continue;
  }

  /* Load both files */
  const geojson = JSON.parse(readFileSync(geoPath, 'utf-8'));
  const elections = JSON.parse(readFileSync(electionPath, 'utf-8'));
  const results = elections.results;

  /* Join election data to each feature by district number */
  let matchCount = 0;
  for (const feature of geojson.features) {
    const districtNum = parseInt(feature.properties?.district, 10) ||
                        parseInt(feature.properties?.districtNum, 10) || 0;

    const result = results[String(districtNum)] || null;

    if (result) {
      feature.properties.electionResult = result;
      feature.properties.margin = result.margin;
      feature.properties.electionYear = entry.year;
      matchCount++;
    }
  }

  /* Write updated GeoJSON back */
  writeFileSync(geoPath, JSON.stringify(geojson));
  console.log(
    `  ${congressFile}: joined ${matchCount}/${geojson.features.length} districts ` +
    `(${entry.year} election)`
  );
  joined++;
}

console.log(`\nDone. Joined ${joined} congress files, skipped ${skipped}.`);
