/**
 * compute-plan-metrics.js — Computes redistricting fairness metrics for district plans.
 * Reads each plan's GeoJSON, calculates Polsby-Popper compactness, Reock compactness,
 * and updates ensemble-metadata.json with the results.
 *
 * Population deviation, efficiency gap, and mean-median require election/population data
 * that isn't embedded in the CD shapefiles, so those remain null for now.
 *
 * Usage: node scripts/compute-plan-metrics.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Computes the Polsby-Popper compactness score for a GeoJSON polygon.
 * Uses a simplified planar calculation (degrees, not meters) for speed.
 * PP = (4 * PI * area) / perimeter^2
 * @param {Array} coordinates - Ring coordinates [[lng, lat], ...]
 * @returns {number} Polsby-Popper score (0 to 1)
 */
function polsbyPopperPlanar(coordinates) {
  const ring = coordinates[0]; // Outer ring only
  if (!ring || ring.length < 4) return 0;

  /* Compute area using the Shoelace formula (signed, in degree^2) */
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1];
    area -= ring[i + 1][0] * ring[i][1];
  }
  area = Math.abs(area) / 2;

  /* Compute perimeter (sum of segment lengths in degrees) */
  let perimeter = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const dx = ring[i + 1][0] - ring[i][0];
    const dy = ring[i + 1][1] - ring[i][1];
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }

  if (perimeter === 0) return 0;
  return (4 * Math.PI * area) / (perimeter * perimeter);
}

/**
 * Computes the bounding box area for a set of coordinates.
 * Used for Reock approximation (bbox instead of minimum bounding circle).
 * @param {Array} coordinates - Ring coordinates [[lng, lat], ...]
 * @returns {{ area: number, bboxArea: number }} District area and bounding box area
 */
function reockApprox(coordinates) {
  const ring = coordinates[0];
  if (!ring || ring.length < 4) return 0;

  /* District area via Shoelace */
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1];
    area -= ring[i + 1][0] * ring[i][1];
  }
  area = Math.abs(area) / 2;

  /* Bounding box area */
  let minLng = Infinity, maxLng = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const bboxWidth = maxLng - minLng;
  const bboxHeight = maxLat - minLat;
  const radius = Math.sqrt(bboxWidth * bboxWidth + bboxHeight * bboxHeight) / 2;
  const circleArea = Math.PI * radius * radius;

  if (circleArea === 0) return 0;
  return area / circleArea;
}

/**
 * Extracts the outer ring coordinates from a GeoJSON feature.
 * Handles both Polygon and MultiPolygon geometries.
 * @param {object} feature - GeoJSON Feature
 * @returns {Array} Coordinates array suitable for metric functions
 */
function getCoordinates(feature) {
  const geom = feature.geometry;
  if (geom.type === 'Polygon') {
    return geom.coordinates;
  }
  if (geom.type === 'MultiPolygon') {
    /* For MultiPolygon, find the largest polygon by vertex count */
    let largest = geom.coordinates[0];
    for (const poly of geom.coordinates) {
      if (poly[0].length > largest[0].length) {
        largest = poly;
      }
    }
    return largest;
  }
  return null;
}

/* ---- Main ---- */

const metadataPath = resolve('data/fair-maps/ensemble-metadata.json');
const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));

/**
 * Processes a single plan entry: loads its GeoJSON, computes metrics,
 * and updates the entry's metrics object.
 * @param {object} plan - Plan entry from metadata
 */
function computeForPlan(plan) {
  /* Resolve GeoJSON path relative to data/fair-maps/ */
  let geoPath = plan.geoFile;
  if (geoPath.startsWith('../')) {
    geoPath = resolve('data', geoPath.replace(/^\.\.\//, ''));
  } else {
    geoPath = resolve('data/fair-maps', geoPath);
  }

  console.log(`\n  Processing: ${plan.title}`);
  console.log(`  GeoJSON: ${geoPath}`);

  let geojson;
  try {
    geojson = JSON.parse(readFileSync(geoPath, 'utf-8'));
  } catch (err) {
    console.log(`  ⚠ Could not read GeoJSON: ${err.message}`);
    return;
  }

  const features = geojson.features || [];
  console.log(`  Features: ${features.length}`);

  if (features.length === 0) return;

  /* Compute Polsby-Popper and Reock for each district, then average */
  let ppSum = 0;
  let reockSum = 0;
  let validCount = 0;

  for (const feature of features) {
    const coords = getCoordinates(feature);
    if (!coords) continue;

    const pp = polsbyPopperPlanar(coords);
    const rk = reockApprox(coords);

    ppSum += pp;
    reockSum += rk;
    validCount++;

    const distNum = feature.properties?.CD119FP || feature.properties?.district || '?';
    console.log(`    District ${distNum}: PP=${pp.toFixed(4)}, Reock=${rk.toFixed(4)}`);
  }

  if (validCount > 0) {
    plan.metrics.polsbyPopper = Math.round((ppSum / validCount) * 1000) / 1000;
    plan.metrics.reock = Math.round((reockSum / validCount) * 1000) / 1000;
    console.log(`  Average PP: ${plan.metrics.polsbyPopper}, Reock: ${plan.metrics.reock}`);
  }
}

console.log('Computing plan metrics...');

/* Compute for baseline */
computeForPlan(metadata.baseline);

/* Compute for all community plans */
for (const plan of metadata.plans) {
  computeForPlan(plan);
}

/* Write updated metadata */
writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
console.log(`\nUpdated ${metadataPath}`);
