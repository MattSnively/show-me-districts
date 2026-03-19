/**
 * download-historical.js — Downloads Missouri congressional district GeoJSON files
 * from the UCLA congressional-district-boundaries GitHub repo.
 *
 * The repo (github.com/JeffreyBLewis/congressional-district-boundaries) contains
 * pre-filtered state files in GeoJson/ named like "Missouri_017_to_021.geojson".
 * Each file contains district boundaries valid for a range of congresses.
 *
 * Usage: node scripts/download-historical.js
 * Output: data/historical/raw/ directory with all 23 Missouri GeoJSON files
 *
 * Phase 1a data pipeline script — not shipped to production.
 */

import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

/** Base URL for raw GitHub content from the UCLA repo */
const BASE_URL = 'https://raw.githubusercontent.com/JeffreyBLewis/congressional-district-boundaries/master/GeoJson';

/**
 * All known Missouri GeoJSON files in the UCLA repo.
 * Each entry is the filename; congress ranges are embedded in the name.
 * Missouri entered the Union in 1821 (17th Congress) and has had districts through the 119th.
 */
const MISSOURI_FILES = [
  'Missouri_017_to_021.geojson',
  'Missouri_022_to_073.geojson',
  'Missouri_030_to_032.geojson',
  'Missouri_033_to_037.geojson',
  'Missouri_038_to_042.geojson',
  'Missouri_043_to_045.geojson',
  'Missouri_046_to_047.geojson',
  'Missouri_048_to_049.geojson',
  'Missouri_050_to_052.geojson',
  'Missouri_053_to_057.geojson',
  'Missouri_058_to_072.geojson',
  'Missouri_074_to_082.geojson',
  'Missouri_083_to_087.geojson',
  'Missouri_088_to_089.geojson',
  'Missouri_090_to_090.geojson',
  'Missouri_091_to_091.geojson',
  'Missouri_092_to_092.geojson',
  'Missouri_093_to_097.geojson',
  'Missouri_098_to_102.geojson',
  'Missouri_103_to_107.geojson',
  'Missouri_108_to_112.geojson',
  'Missouri_113_to_117.geojson',
  'Missouri_118_to_119.geojson',
];

const OUTPUT_DIR = 'data/historical/raw';

/**
 * Downloads a single file from the UCLA repo via fetch.
 * Skips files that already exist locally to support incremental runs.
 */
async function downloadFile(filename) {
  const outPath = join(OUTPUT_DIR, filename);

  /* Skip if already downloaded */
  if (existsSync(outPath)) {
    console.log(`  [skip] ${filename} (already exists)`);
    return;
  }

  const url = `${BASE_URL}/${filename}`;
  console.log(`  [fetch] ${filename}...`);

  const response = await fetch(url);
  if (!response.ok) {
    console.error(`  [ERROR] ${filename}: HTTP ${response.status}`);
    return;
  }

  const text = await response.text();
  writeFileSync(outPath, text);
  console.log(`  [done] ${filename} (${(text.length / 1024).toFixed(0)} KB)`);
}

/* Main execution */
async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`Downloading ${MISSOURI_FILES.length} Missouri GeoJSON files from UCLA repo...\n`);

  /* Download sequentially to be polite to GitHub */
  for (const file of MISSOURI_FILES) {
    await downloadFile(file);
  }

  console.log('\nAll downloads complete. Run scripts/extract-missouri.js next to build per-congress files.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
