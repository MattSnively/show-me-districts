/**
 * prepare-census-tracts.js — Extracts and simplifies Missouri census tracts
 * from the Redistricting Data Hub shapefile for use in the district editor.
 *
 * Usage: node scripts/prepare-census-tracts.js <input-shapefile>
 *
 * Output: data/census/mo-tracts-2020.geojson with population and VAP per tract.
 *
 * Phase 1c data pipeline script — not shipped to production.
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const inputFile = process.argv[2];

if (!inputFile) {
  console.error('Usage: node scripts/prepare-census-tracts.js <input-shapefile>');
  console.error('  Input: PL 94-171 shapefile from Redistricting Data Hub');
  process.exit(1);
}

const outputDir = 'data/census';
const outputFile = `${outputDir}/mo-tracts-2020.geojson`;
const tempFile = `${outputDir}/_temp_tracts.geojson`;

mkdirSync(outputDir, { recursive: true });

/* Step 1: Convert shapefile to GeoJSON and filter to Missouri (FIPS 29) */
console.log('Converting shapefile to GeoJSON...');
execSync(
  `npx mapshaper "${inputFile}" ` +
  `-filter 'STATEFP === "29" || STATEFP20 === "29"' ` +
  `-simplify 30% ` +
  `-o "${tempFile}" format=geojson`,
  { stdio: 'inherit' }
);

/* Step 2: Read and clean up properties to keep only what we need */
console.log('Cleaning properties...');
const raw = JSON.parse(readFileSync(tempFile, 'utf-8'));

const cleaned = {
  type: 'FeatureCollection',
  features: raw.features.map((f) => ({
    type: 'Feature',
    geometry: f.geometry,
    properties: {
      /* Census tract identifier (GEOID) */
      geoid: f.properties.GEOID20 || f.properties.GEOID || '',
      /* County name or FIPS for context */
      county: f.properties.COUNTYFP20 || f.properties.COUNTYFP || '',
      /* Total population from PL 94-171 */
      population: Number(f.properties.P0010001 || f.properties.POP100 || 0),
      /* Voting age population */
      vap: Number(f.properties.P0030001 || f.properties.VAP || 0),
      /* District assignment (starts unassigned) */
      district: 0,
    },
  })),
};

writeFileSync(outputFile, JSON.stringify(cleaned));
console.log(`Wrote ${cleaned.features.length} tracts to ${outputFile}`);

/* Cleanup temp file */
execSync(`rm "${tempFile}"`);
console.log('Done.');
