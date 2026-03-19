/**
 * prepare-census-tracts.js — Prepares Missouri census tracts for the district editor.
 *
 * Takes the raw TIGER/Line tract GeoJSON (geometry only) and:
 *   1. Strips unneeded properties, keeping only GEOID, county, and tract name
 *   2. Simplifies geometry with mapshaper for browser performance
 *   3. Adds placeholder population fields (to be replaced with real PL 94-171 data)
 *   4. Initializes district assignment to 0 (unassigned)
 *
 * For real population data, download the Missouri tract-level PL 94-171 shapefile
 * from redistrictingdatahub.org and run with --pl94171 flag (TODO).
 *
 * Usage: node scripts/prepare-census-tracts.js [--pl94171 <shapefile>]
 * Input:  data/census/mo-tracts-2020-raw.geojson
 * Output: data/census/mo-tracts-2020.geojson
 *
 * Phase 1c data pipeline script — not shipped to production.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const INPUT_FILE = 'data/census/mo-tracts-2020-raw.geojson';
const SIMPLIFIED_TEMP = 'data/census/_temp_simplified.geojson';
const OUTPUT_FILE = 'data/census/mo-tracts-2020.geojson';

/** Missouri total population from 2020 census */
const MO_TOTAL_POP_2020 = 6154913;

if (!existsSync(INPUT_FILE)) {
  console.error(`Input file not found: ${INPUT_FILE}`);
  console.error('Run scripts/download-census-tracts.js first.');
  process.exit(1);
}

/* Step 1: Simplify geometry with mapshaper (9MB → ~2MB target) */
console.log('Simplifying tract geometries...');
execSync(
  `npx mapshaper "${INPUT_FILE}" -simplify 15% keep-shapes -o "${SIMPLIFIED_TEMP}" format=geojson`,
  { stdio: 'pipe' }
);

/* Step 2: Read simplified GeoJSON and clean properties */
console.log('Cleaning properties and adding population placeholders...');
const raw = JSON.parse(readFileSync(SIMPLIFIED_TEMP, 'utf-8'));
const tractCount = raw.features.length;

/**
 * Estimate population per tract using land area as a rough proxy.
 * This is a placeholder — real PL 94-171 data should replace these values.
 * We distribute MO_TOTAL_POP_2020 proportionally by land area.
 */
const totalLandArea = raw.features.reduce(
  (sum, f) => sum + (Number(f.properties.ALAND) || 0), 0
);

const cleaned = {
  type: 'FeatureCollection',
  properties: {
    state: 'Missouri',
    source: 'Census TIGER/Line 2020',
    tractCount,
    totalPopulation: MO_TOTAL_POP_2020,
    populationNote: 'Population values are ESTIMATED from land area. Replace with PL 94-171 data for accuracy.',
  },
  features: raw.features.map((f) => {
    const landArea = Number(f.properties.ALAND) || 0;
    /* Distribute population proportionally by land area (rough estimate) */
    const estPop = Math.round((landArea / totalLandArea) * MO_TOTAL_POP_2020);
    /* Estimate VAP as ~77% of total (national average for 2020) */
    const estVap = Math.round(estPop * 0.77);

    return {
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        geoid: f.properties.GEOID || '',
        county: f.properties.COUNTYFP || '',
        name: f.properties.NAME || '',
        population: estPop,
        vap: estVap,
        district: 0,
        populationSource: 'estimated',
      },
    };
  }),
};

/* Step 3: Write output */
writeFileSync(OUTPUT_FILE, JSON.stringify(cleaned));

/* Cleanup temp file */
execSync(`rm "${SIMPLIFIED_TEMP}"`);

const outSize = (readFileSync(OUTPUT_FILE).length / 1024).toFixed(0);
console.log(`\nWrote ${tractCount} tracts to ${OUTPUT_FILE} (${outSize} KB)`);
console.log(`Total estimated population: ${MO_TOTAL_POP_2020.toLocaleString()}`);
console.log('\nWARNING: Population values are rough estimates based on land area.');
console.log('For accurate data, download PL 94-171 from redistrictingdatahub.org');
console.log('and re-run with real population joined to tracts.');
