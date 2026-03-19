/**
 * simplify-historical.js — Simplifies all per-congress GeoJSON files using
 * mapshaper to reduce file sizes for web delivery. Also generates a congress
 * index JSON file with metadata for the timeline UI.
 *
 * Usage: node scripts/simplify-historical.js
 * Input:  data/historical/congress-*.geojson
 * Output: data/historical/simplified/ (simplified GeoJSON files)
 *         data/historical/congress-index.json (metadata for all congresses)
 *
 * Phase 1a data pipeline script — not shipped to production.
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'fs';
import { join } from 'path';

const INPUT_DIR = 'data/historical';
const OUTPUT_DIR = 'data/historical/simplified';

/** Target file size in bytes (200KB — generous for individual congress files) */
const TARGET_SIZE = 200 * 1024;

/**
 * Mapping from congress number to approximate year range.
 * Each congress spans 2 years, starting from the 1st Congress in 1789.
 */
function congressToYears(congressNum) {
  const startYear = 1789 + (congressNum - 1) * 2;
  return { startYear, endYear: startYear + 1 };
}

/* Main execution */
function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const files = readdirSync(INPUT_DIR)
    .filter((f) => f.match(/^congress-\d+\.geojson$/))
    .sort();

  console.log(`Simplifying ${files.length} congress files...\n`);

  /** Collect metadata for the congress index */
  const index = [];

  for (const file of files) {
    const inputPath = join(INPUT_DIR, file);
    const outputPath = join(OUTPUT_DIR, file);
    const inputSize = statSync(inputPath).size;

    /* Parse congress number from filename */
    const congressNum = parseInt(file.match(/congress-(\d+)/)[1], 10);
    const { startYear, endYear } = congressToYears(congressNum);

    /* Read to get district count */
    const geojson = JSON.parse(readFileSync(inputPath, 'utf-8'));
    const districtCount = geojson.features.length;

    /* Simplify with mapshaper — use percentage that fits target */
    const simplifyPct = inputSize > TARGET_SIZE ? '20%' : '50%';

    try {
      execSync(
        `npx mapshaper "${inputPath}" -simplify ${simplifyPct} keep-shapes -o "${outputPath}" format=geojson`,
        { stdio: 'pipe' }
      );
      const outSize = statSync(outputPath).size;
      const reduction = ((1 - outSize / inputSize) * 100).toFixed(0);
      console.log(
        `  ${file}: ${(inputSize / 1024).toFixed(0)}KB → ${(outSize / 1024).toFixed(0)}KB (-${reduction}%) | ${districtCount} districts`
      );
    } catch (err) {
      console.error(`  ${file}: mapshaper failed, copying original`);
      writeFileSync(outputPath, readFileSync(inputPath));
    }

    /* Add to index */
    index.push({
      congress: congressNum,
      startYear,
      endYear,
      districts: districtCount,
      file: `congress-${String(congressNum).padStart(3, '0')}.geojson`,
    });
  }

  /* Write congress index */
  const indexPath = join(INPUT_DIR, 'congress-index.json');
  writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`\nWrote congress-index.json with ${index.length} entries`);

  /* Report total sizes */
  const totalInput = files.reduce(
    (sum, f) => sum + statSync(join(INPUT_DIR, f)).size, 0
  );
  const totalOutput = files.reduce(
    (sum, f) => sum + statSync(join(OUTPUT_DIR, f)).size, 0
  );
  console.log(
    `\nTotal: ${(totalInput / 1024 / 1024).toFixed(1)}MB → ${(totalOutput / 1024 / 1024).toFixed(1)}MB`
  );
}

main();
