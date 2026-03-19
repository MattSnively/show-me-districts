/**
 * extract-missouri.js — Filters Missouri features (FIPS code 29) from the
 * UCLA national congressional district GeoJSON files.
 *
 * Usage: node scripts/extract-missouri.js <input-dir> <output-dir>
 *
 * Input:  UCLA congressional-district-boundaries repo (GeoJSON by congress number)
 * Output: data/historical/ directory with MO-only GeoJSON files per congress
 *
 * Phase 1a data pipeline script — not shipped to production.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';

/** Missouri FIPS state code */
const MO_FIPS = '29';

/**
 * Extracts Missouri features from a national GeoJSON FeatureCollection.
 * Matches on STATEFP, STATEFP20, or state_fips properties.
 */
function extractMissouri(geojson) {
  const moFeatures = geojson.features.filter((f) => {
    const props = f.properties || {};
    const fips = props.STATEFP || props.STATEFP20 || props.state_fips || props.STATEFP10 || '';
    return String(fips) === MO_FIPS;
  });

  return {
    type: 'FeatureCollection',
    features: moFeatures,
  };
}

/* Main execution */
const inputDir = process.argv[2];
const outputDir = process.argv[3] || 'data/historical';

if (!inputDir) {
  console.error('Usage: node scripts/extract-missouri.js <input-dir> [output-dir]');
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });

const files = readdirSync(inputDir).filter((f) => f.endsWith('.geojson') || f.endsWith('.json'));
console.log(`Found ${files.length} GeoJSON files in ${inputDir}`);

for (const file of files) {
  const raw = readFileSync(join(inputDir, file), 'utf-8');
  const geojson = JSON.parse(raw);
  const moData = extractMissouri(geojson);

  if (moData.features.length > 0) {
    const outPath = join(outputDir, file);
    writeFileSync(outPath, JSON.stringify(moData));
    console.log(`  ${file}: ${moData.features.length} MO features`);
  } else {
    console.log(`  ${file}: no MO features found, skipping`);
  }
}

console.log('Done.');
