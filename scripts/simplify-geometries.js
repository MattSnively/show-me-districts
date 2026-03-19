/**
 * simplify-geometries.js — Uses mapshaper to simplify GeoJSON files for web delivery.
 * Target: each era file should be under ~500KB for fast loading.
 *
 * Usage: node scripts/simplify-geometries.js <input-dir> <output-dir>
 *
 * Phase 1a data pipeline script — not shipped to production.
 */

import { execSync } from 'child_process';
import { readdirSync, statSync, mkdirSync } from 'fs';
import { join } from 'path';

/** Target file size in bytes (500KB) */
const TARGET_SIZE = 500 * 1024;

/** Simplification percentages to try (higher = more simplified) */
const SIMPLIFY_LEVELS = ['50%', '30%', '15%', '10%', '5%'];

const inputDir = process.argv[2];
const outputDir = process.argv[3] || 'data/historical';

if (!inputDir) {
  console.error('Usage: node scripts/simplify-geometries.js <input-dir> [output-dir]');
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });

const files = readdirSync(inputDir).filter((f) => f.endsWith('.geojson') || f.endsWith('.json'));

for (const file of files) {
  const inputPath = join(inputDir, file);
  const outputPath = join(outputDir, file);
  const inputSize = statSync(inputPath).size;

  /* Skip files already under target size */
  if (inputSize <= TARGET_SIZE) {
    console.log(`  ${file}: ${(inputSize / 1024).toFixed(0)}KB — already small enough`);
    execSync(`cp "${inputPath}" "${outputPath}"`);
    continue;
  }

  /* Try progressively more aggressive simplification until under target */
  let simplified = false;
  for (const level of SIMPLIFY_LEVELS) {
    try {
      execSync(
        `npx mapshaper "${inputPath}" -simplify ${level} -o "${outputPath}" format=geojson`,
        { stdio: 'pipe' }
      );
      const outSize = statSync(outputPath).size;
      if (outSize <= TARGET_SIZE) {
        console.log(`  ${file}: ${(inputSize / 1024).toFixed(0)}KB → ${(outSize / 1024).toFixed(0)}KB (${level})`);
        simplified = true;
        break;
      }
    } catch (err) {
      console.error(`  ${file}: mapshaper failed at ${level}`);
    }
  }

  if (!simplified) {
    console.warn(`  ${file}: could not simplify below ${(TARGET_SIZE / 1024).toFixed(0)}KB`);
  }
}

console.log('Done.');
