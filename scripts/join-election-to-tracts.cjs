/**
 * join-election-to-tracts.cjs — Aggregates 2020 presidential election results
 * from census block level to tract level, then joins them onto the tract
 * GeoJSON used by the district editor.
 *
 * Data source: Redistricting Data Hub "2018-2020 Block Assign with Election
 * Results" Excel file. Votes are disaggregated from precinct to block using
 * a population allocation factor (PAF), so block-level values are fractional.
 * We sum them to tract level (first 11 digits of the 15-digit BLOCKID).
 *
 * Uses the dense sheet option and single-sheet loading to reduce memory on
 * the ~253K row file.
 *
 * Usage: node scripts/join-election-to-tracts.cjs
 */

const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '..', 'data', 'elections', 'mo-2020-pres-by-block.csv');
const TRACT_PATH = path.join(__dirname, '..', 'data', 'census', 'mo-tracts-2020.geojson');
const PUBLIC_PATH = path.join(__dirname, '..', 'public', 'data', 'census', 'mo-tracts-2020.geojson');

/* Step 1: Read the pre-extracted CSV (produced by extract-election-csv.py) */
console.log('Reading block-level election CSV...');
console.time('csv');

const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
const lines = csvContent.split('\n');
console.timeEnd('csv');
console.log(`Read ${lines.length - 1} lines.`);

/* Step 2: Aggregate block-level votes to tract level.
 * Tract GEOID = first 11 characters of the 15-digit BLOCKID
 * (state 2 + county 3 + tract 6 = 11 digits). */
const tractVotes = new Map();
let rowCount = 0;

/* Skip header row (line 0) */
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  const [blockId, demStr, repStr] = line.split(',');
  if (!blockId || blockId.length < 11) continue;

  const tractGeoid = blockId.substring(0, 11);
  const dem = parseFloat(demStr) || 0;
  const rep = parseFloat(repStr) || 0;

  if (!tractVotes.has(tractGeoid)) {
    tractVotes.set(tractGeoid, { dem: 0, rep: 0 });
  }

  const entry = tractVotes.get(tractGeoid);
  entry.dem += dem;
  entry.rep += rep;
  rowCount++;
}

console.log(`Processed ${rowCount} block rows → ${tractVotes.size} tracts.`);

/* Spot-check: show a few tract totals */
let i = 0;
for (const [geoid, votes] of tractVotes) {
  if (i++ >= 5) break;
  const total = votes.dem + votes.rep;
  const demPct = total > 0 ? (votes.dem / total * 100).toFixed(1) : '0.0';
  console.log(`  Tract ${geoid}: D=${votes.dem.toFixed(1)} R=${votes.rep.toFixed(1)} (D+${demPct}%)`);
}

/* Step 3: Load tract GeoJSON and join election data */
console.log('Reading tract GeoJSON...');
const geojson = JSON.parse(fs.readFileSync(TRACT_PATH, 'utf8'));

let matched = 0;
let unmatched = 0;

for (const feature of geojson.features) {
  const geoid = feature.properties.geoid;
  const votes = tractVotes.get(geoid);

  if (votes) {
    /* Round to 1 decimal place (values are fractional from PAF disaggregation) */
    feature.properties.dem_votes = Math.round(votes.dem * 10) / 10;
    feature.properties.rep_votes = Math.round(votes.rep * 10) / 10;
    matched++;
  } else {
    feature.properties.dem_votes = 0;
    feature.properties.rep_votes = 0;
    unmatched++;
  }
}

console.log(`Matched: ${matched} tracts, Unmatched: ${unmatched} tracts.`);

/* Step 4: Verify with district-level totals */
const districtTotals = {};
for (const feature of geojson.features) {
  const d = feature.properties.district || 'none';
  if (!districtTotals[d]) districtTotals[d] = { dem: 0, rep: 0 };
  districtTotals[d].dem += feature.properties.dem_votes;
  districtTotals[d].rep += feature.properties.rep_votes;
}

console.log('\nDistrict-level 2020 presidential vote totals (pre-2022 districts):');
let totalDem = 0, totalRep = 0;
for (const [dist, votes] of Object.entries(districtTotals).sort()) {
  const total = votes.dem + votes.rep;
  const margin = total > 0 ? ((votes.dem - votes.rep) / total * 100).toFixed(1) : '0.0';
  const winner = votes.dem > votes.rep ? 'D' : 'R';
  console.log(`  CD-${dist}: D=${Math.round(votes.dem).toLocaleString()} R=${Math.round(votes.rep).toLocaleString()} → ${winner}+${Math.abs(parseFloat(margin))}%`);
  totalDem += votes.dem;
  totalRep += votes.rep;
}
console.log(`  TOTAL: D=${Math.round(totalDem).toLocaleString()} R=${Math.round(totalRep).toLocaleString()}`);

/* Step 5: Write updated files */
fs.writeFileSync(TRACT_PATH, JSON.stringify(geojson));
console.log(`\nWrote ${TRACT_PATH}`);

fs.mkdirSync(path.dirname(PUBLIC_PATH), { recursive: true });
fs.copyFileSync(TRACT_PATH, PUBLIC_PATH);
console.log(`Copied to ${PUBLIC_PATH}`);

console.log('Done!');
