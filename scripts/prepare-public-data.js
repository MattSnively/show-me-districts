/**
 * prepare-public-data.js — Copies processed data files into public/ for static serving.
 * Astro serves files in public/ as-is at the root URL path.
 * This script should be run before `npm run build` or `npm run dev`.
 *
 * Usage: node scripts/prepare-public-data.js
 *
 * Copies:
 *   data/historical/simplified/*.geojson → public/data/historical/simplified/
 *   data/historical/congress-index.json  → public/data/historical/
 *   data/elections/*.json                → public/data/elections/
 *   data/census/mo-tracts-2020.geojson   → public/data/census/
 *   data/census/mo-cd-current.geojson    → public/data/census/
 *   data/fair-maps/ensemble-metadata.json → public/data/fair-maps/
 */

import { cpSync, mkdirSync } from 'fs';

const copies = [
  { src: 'data/historical/simplified', dest: 'public/data/historical/simplified' },
  { src: 'data/historical/congress-index.json', dest: 'public/data/historical/congress-index.json' },
  { src: 'data/elections', dest: 'public/data/elections' },
  { src: 'data/census/mo-tracts-2020.geojson', dest: 'public/data/census/mo-tracts-2020.geojson' },
  { src: 'data/census/mo-cd-current.geojson', dest: 'public/data/census/mo-cd-current.geojson' },
  { src: 'data/fair-maps/ensemble-metadata.json', dest: 'public/data/fair-maps/ensemble-metadata.json' },
];

console.log('Copying data files to public/ for static serving...\n');

for (const { src, dest } of copies) {
  /* Ensure parent directory exists */
  const parentDir = dest.includes('.') ? dest.replace(/\/[^/]+$/, '') : dest;
  mkdirSync(parentDir, { recursive: true });

  cpSync(src, dest, { recursive: true });
  console.log(`  ${src} → ${dest}`);
}

console.log('\nDone. Data files are ready for static serving.');
