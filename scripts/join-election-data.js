/**
 * join-election-data.js — Merges election results from data/elections/ onto
 * district GeoJSON features in data/historical/.
 *
 * Usage: node scripts/join-election-data.js
 *
 * Phase 1b data pipeline script — not shipped to production.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const HISTORICAL_DIR = 'data/historical';
const ELECTIONS_DIR = 'data/elections';

/**
 * Loads election JSON for a given congress number.
 * Returns null if no data is available for that congress.
 */
function loadElections(congressNumber) {
  const path = join(ELECTIONS_DIR, `congress-${congressNumber}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/**
 * Attaches election results to each feature's properties.
 * Matches on district number from GeoJSON properties.
 */
function joinData(geojson, elections) {
  for (const feature of geojson.features) {
    const district = feature.properties?.district || feature.properties?.CD || 0;
    const result = elections[String(district)] || null;
    feature.properties = {
      ...feature.properties,
      electionResult: result,
      margin: result?.margin ?? null,
    };
  }
  return geojson;
}

/* Main execution */
const geoFiles = readdirSync(HISTORICAL_DIR).filter((f) => f.endsWith('.geojson') || f.endsWith('.json'));

for (const file of geoFiles) {
  /* Extract congress number from filename (e.g., "congress-118.geojson" → 118) */
  const match = file.match(/(\d+)/);
  if (!match) continue;

  const congressNum = parseInt(match[1], 10);
  const elections = loadElections(congressNum);

  if (!elections) {
    console.log(`  ${file}: no election data for congress ${congressNum}`);
    continue;
  }

  const geoPath = join(HISTORICAL_DIR, file);
  const geojson = JSON.parse(readFileSync(geoPath, 'utf-8'));
  const joined = joinData(geojson, elections);

  writeFileSync(geoPath, JSON.stringify(joined));
  console.log(`  ${file}: joined election data for ${Object.keys(elections).length} districts`);
}

console.log('Done.');
