/**
 * download-census-tracts.js — Downloads Missouri 2020 census tract boundaries
 * from the Census Bureau TIGER/Line FTP and the current congressional district
 * boundaries. Converts shapefiles to GeoJSON using mapshaper.
 *
 * Note: This script downloads GEOMETRY only. Population data must be joined
 * separately from PL 94-171 files (see prepare-census-tracts.js).
 *
 * For a pre-joined file (geometry + population), register at redistrictingdatahub.org
 * and download their Missouri tract-level PL 94-171 shapefile instead.
 *
 * Usage: node scripts/download-census-tracts.js
 * Output:
 *   data/census/mo-tracts-2020-raw.geojson  (tract boundaries, no population)
 *   data/census/mo-cd-118.geojson           (current congressional districts)
 *
 * Phase 1c data pipeline script — not shipped to production.
 */

import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const OUTPUT_DIR = 'data/census';
const TEMP_DIR = 'data/census/_temp';

/** Census Bureau TIGER/Line download URLs */
const DOWNLOADS = [
  {
    name: 'Missouri 2020 Census Tracts',
    url: 'https://www2.census.gov/geo/tiger/TIGER2020/TRACT/tl_2020_29_tract.zip',
    zipName: 'tl_2020_29_tract.zip',
    shpName: 'tl_2020_29_tract.shp',
    output: 'mo-tracts-2020-raw.geojson',
    simplify: '30%',
  },
  {
    name: 'Missouri 119th Congressional Districts (current)',
    url: 'https://www2.census.gov/geo/tiger/TIGER2024/CD/tl_2024_29_cd119.zip',
    zipName: 'tl_2024_29_cd119.zip',
    shpName: 'tl_2024_29_cd119.shp',
    output: 'mo-cd-current.geojson',
    simplify: '30%',
  },
];

/**
 * Downloads a file via fetch and saves it to disk.
 */
async function downloadFile(url, outPath) {
  console.log(`  Downloading ${url}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(outPath, buffer);
  console.log(`  Saved (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(TEMP_DIR, { recursive: true });

  for (const dl of DOWNLOADS) {
    console.log(`\n--- ${dl.name} ---`);
    const outputPath = `${OUTPUT_DIR}/${dl.output}`;

    /* Skip if output already exists */
    if (existsSync(outputPath)) {
      console.log(`  [skip] ${dl.output} already exists`);
      continue;
    }

    /* Download zip */
    const zipPath = `${TEMP_DIR}/${dl.zipName}`;
    if (!existsSync(zipPath)) {
      await downloadFile(dl.url, zipPath);
    }

    /* Unzip */
    console.log(`  Extracting...`);
    execSync(`unzip -o "${zipPath}" -d "${TEMP_DIR}"`, { stdio: 'pipe' });

    /* Convert to GeoJSON with mapshaper, applying filter and simplification */
    const shpPath = `${TEMP_DIR}/${dl.shpName}`;
    const filterCmd = dl.filter ? `-filter '${dl.filter}'` : '';
    const cmd = `npx mapshaper "${shpPath}" ${filterCmd} -simplify ${dl.simplify} keep-shapes -o "${outputPath}" format=geojson`;
    console.log(`  Converting to GeoJSON...`);
    execSync(cmd, { stdio: 'pipe' });

    console.log(`  Done: ${dl.output}`);
  }

  /* Cleanup temp directory */
  console.log('\nCleaning up temp files...');
  execSync(`rm -rf "${TEMP_DIR}"`);

  console.log('\nAll downloads complete.');
  console.log('Note: Tract GeoJSON has geometry only. Population data must be joined separately.');
  console.log('For pre-joined data, download from redistrictingdatahub.org instead.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
