<!--
  HistoricalMap.svelte — Interactive MapLibre map showing Missouri congressional
  districts across history. Users slide a timeline to browse congress numbers,
  districts are colored by partisan lean when election data is available, and
  clicking a district shows a popup with election results.

  Props:
    congressIndex — Array of { congress, startYear, endYear, districts, file } from congress-index.json
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { MO_BOUNDS, MO_CENTER, partisanColor, DISTRICT_COLORS } from '../../lib/map-utils';

  /** Congress index entry from congress-index.json */
  interface CongressEntry {
    congress: number;
    startYear: number;
    endYear: number;
    districts: number;
    file: string;
  }

  /** Props passed from the Astro page */
  interface Props {
    congressIndex: CongressEntry[];
  }

  let { congressIndex }: Props = $props();

  /** Current congress number controlled by the timeline slider */
  let currentCongress = $state(119);

  /** Whether to show partisan colors (true) or neutral district colors (false) */
  let showElections = $state(true);

  /** Whether the GeoJSON is currently loading */
  let isLoading = $state(false);

  /** Info about the currently displayed congress for the status bar */
  let congressInfo = $derived(
    congressIndex.find((c) => c.congress === currentCongress)
  );

  /** Whether the current congress has election data attached */
  let hasElectionData = $state(false);

  /** Map and popup references */
  let mapContainer: HTMLDivElement;
  let map: maplibregl.Map | null = null;
  let popup: maplibregl.Popup | null = null;

  /**
   * Cache of loaded GeoJSON to avoid re-fetching.
   * Evicts oldest entries when cache exceeds MAX_CACHE_SIZE to prevent memory bloat
   * (each congress GeoJSON is ~100-200KB, 10 entries ≈ 1-2MB max).
   */
  const MAX_CACHE_SIZE = 10;
  const geoCache = new Map<number, any>();

  /** Inserts into cache with LRU eviction when at capacity */
  function cacheSet(key: number, value: any) {
    if (geoCache.has(key)) geoCache.delete(key); // Move to end (most recent)
    geoCache.set(key, value);
    if (geoCache.size > MAX_CACHE_SIZE) {
      const oldest = geoCache.keys().next().value;
      geoCache.delete(oldest);
    }
  }

  /**
   * Converts a congress number to its approximate year range string.
   * Each congress spans 2 years, starting from the 1st Congress in 1789.
   */
  function congressYears(num: number): string {
    const start = 1789 + (num - 1) * 2;
    return `${start}–${start + 1}`;
  }

  /**
   * Returns an ordinal suffix for a number (1st, 2nd, 3rd, 4th, etc.)
   */
  function ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /**
   * Fetches and caches the simplified GeoJSON for a given congress number.
   * Files live in /data/historical/simplified/congress-NNN.geojson.
   */
  async function loadCongressGeoJSON(congressNum: number): Promise<any> {
    if (geoCache.has(congressNum)) {
      return geoCache.get(congressNum);
    }

    const padded = String(congressNum).padStart(3, '0');
    const url = `/data/historical/simplified/congress-${padded}.geojson`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to load ${url}: ${response.status}`);
      return null;
    }

    const geojson = await response.json();
    cacheSet(congressNum, geojson);
    return geojson;
  }

  /**
   * Builds a fill color expression for MapLibre based on display mode.
   * In election mode: uses partisan red-blue gradient based on margin.
   * In boundary mode: uses distinct colors per district number.
   */
  function buildFillColor(geojson: any): any {
    if (showElections) {
      /* Check if any features have election data */
      const hasMargins = geojson.features.some(
        (f: any) => f.properties.margin != null
      );

      if (hasMargins) {
        /* Build a match expression: map each district to its partisan color */
        const matchExpr: any[] = ['match', ['get', 'districtNum']];
        for (const feature of geojson.features) {
          const dist = feature.properties.districtNum;
          const margin = feature.properties.margin;
          if (dist && margin != null) {
            matchExpr.push(dist, partisanColor(margin));
          }
        }
        /* Default fallback color for districts without data */
        matchExpr.push('#D4D4D4');
        return matchExpr;
      }
    }

    /* Boundary-only mode: assign distinct colors by district number */
    const matchExpr: any[] = ['match', ['get', 'districtNum']];
    for (let i = 0; i < 20; i++) {
      matchExpr.push(i, DISTRICT_COLORS[i % DISTRICT_COLORS.length]);
    }
    matchExpr.push('#D4D4D4');
    return matchExpr;
  }

  /**
   * Updates the map to show districts for the given congress number.
   * Removes old layers/sources, loads new GeoJSON, and adds styled layers.
   */
  async function updateMap(congressNum: number) {
    if (!map) return;

    isLoading = true;

    /* Remove existing district layers and source */
    if (map.getLayer('districts-fill')) map.removeLayer('districts-fill');
    if (map.getLayer('districts-line')) map.removeLayer('districts-line');
    if (map.getLayer('districts-hover')) map.removeLayer('districts-hover');
    if (map.getSource('districts')) map.removeSource('districts');

    /* Close any open popup */
    if (popup) {
      popup.remove();
      popup = null;
    }

    /* Fetch GeoJSON for this congress */
    const geojson = await loadCongressGeoJSON(congressNum);
    if (!geojson || !map) {
      isLoading = false;
      return;
    }

    /* Track whether this congress has election data */
    hasElectionData = geojson.features.some(
      (f: any) => f.properties.electionResult != null
    );

    /* Add the GeoJSON source */
    map.addSource('districts', {
      type: 'geojson',
      data: geojson,
    });

    /* District fill layer — colored by partisan lean or district number */
    map.addLayer({
      id: 'districts-fill',
      type: 'fill',
      source: 'districts',
      paint: {
        'fill-color': buildFillColor(geojson),
        'fill-opacity': 0.6,
      },
    });

    /* Hover highlight layer — initially hidden, shown on mouseover */
    map.addLayer({
      id: 'districts-hover',
      type: 'fill',
      source: 'districts',
      paint: {
        'fill-color': '#D4A843',
        'fill-opacity': 0.3,
      },
      filter: ['==', 'districtNum', -1],
    });

    /* District boundary lines */
    map.addLayer({
      id: 'districts-line',
      type: 'line',
      source: 'districts',
      paint: {
        'line-color': '#003B6F',
        'line-width': 1.5,
        'line-opacity': 0.8,
      },
    });

    isLoading = false;
  }

  /**
   * Formats election result data into HTML for the map popup.
   */
  function formatPopupHTML(props: any): string {
    const distNum = props.districtNum || props.district || '?';
    let html = `<div style="font-family: system-ui, sans-serif; min-width: 200px;">`;
    html += `<div style="font-weight: bold; font-size: 14px; margin-bottom: 6px; color: #262626;">`;
    html += `District ${distNum}`;
    html += `</div>`;

    /* Show election results if available */
    const result = props.electionResult;
    if (result) {
      html += `<div style="font-size: 11px; color: #525252; margin-bottom: 6px;">${result.year} Election</div>`;

      for (const candidate of result.candidates) {
        const isWinner = candidate.winner;
        const partyColor = candidate.party === 'Democratic' ? '#2563EB' : '#DC2626';
        const pct = ((candidate.votes / result.totalVotes) * 100).toFixed(1);

        html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">`;
        html += `<span style="font-size: 12px; ${isWinner ? 'font-weight: bold;' : ''} color: ${partyColor};">`;
        html += `${candidate.name} (${candidate.party.charAt(0)})`;
        html += `</span>`;
        html += `<span style="font-size: 12px; margin-left: 12px; color: #525252;">${pct}%</span>`;
        html += `</div>`;
      }

      /* Margin indicator */
      const margin = result.margin;
      const marginPct = (Math.abs(margin) * 100).toFixed(1);
      const winner = margin < 0 ? 'D' : 'R';
      html += `<div style="font-size: 11px; color: #525252; margin-top: 4px; padding-top: 4px; border-top: 1px solid #E5E5E5;">`;
      html += `Margin: ${winner} +${marginPct}%`;
      html += `</div>`;
    } else {
      /* No election data available */
      html += `<div style="font-size: 12px; color: #525252;">Election data not available for this era</div>`;

      /* Show county info if available */
      if (props.county) {
        html += `<div style="font-size: 11px; color: #737373; margin-top: 4px;">Counties: ${props.county.substring(0, 100)}${props.county.length > 100 ? '...' : ''}</div>`;
      }
    }

    html += `</div>`;
    return html;
  }

  /**
   * Initializes the MapLibre map and sets up event handlers for hover and click.
   */
  onMount(() => {
    map = new maplibregl.Map({
      container: mapContainer,
      /* Free OpenStreetMap raster tiles as basemap */
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          },
        },
        layers: [
          {
            id: 'osm-tiles',
            type: 'raster',
            source: 'osm',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: MO_CENTER,
      zoom: 6.2,
      maxBounds: [
        [MO_BOUNDS[0] - 2, MO_BOUNDS[1] - 1],
        [MO_BOUNDS[2] + 2, MO_BOUNDS[3] + 1],
      ],
    });

    /* Add zoom/rotation controls */
    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    /* Load initial congress once map is ready */
    map.on('load', () => {
      updateMap(currentCongress);
    });

    /* Hover effect: highlight district under cursor */
    map.on('mousemove', 'districts-fill', (e) => {
      if (!map) return;
      map.getCanvas().style.cursor = 'pointer';
      if (e.features && e.features.length > 0) {
        const distNum = e.features[0].properties?.districtNum;
        map.setFilter('districts-hover', ['==', 'districtNum', distNum ?? -1]);
      }
    });

    /* Remove hover highlight when leaving district */
    map.on('mouseleave', 'districts-fill', () => {
      if (!map) return;
      map.getCanvas().style.cursor = '';
      map.setFilter('districts-hover', ['==', 'districtNum', -1]);
    });

    /* Click handler: show popup with election results */
    map.on('click', 'districts-fill', (e) => {
      if (!map || !e.features || e.features.length === 0) return;

      /* Parse properties — MapLibre stringifies nested objects */
      const rawProps = e.features[0].properties || {};
      const props = { ...rawProps };
      if (typeof props.electionResult === 'string') {
        try { props.electionResult = JSON.parse(props.electionResult); } catch { /* ignore */ }
      }

      /* Close existing popup */
      if (popup) popup.remove();

      /* Create new popup at click location */
      popup = new maplibregl.Popup({ maxWidth: '320px' })
        .setLngLat(e.lngLat)
        .setHTML(formatPopupHTML(props))
        .addTo(map!);
    });

    /* Cleanup on component destroy */
    return () => {
      if (popup) popup.remove();
      if (map) map.remove();
    };
  });

  /**
   * Reactive effect: when congress number or display mode changes, update the map.
   */
  $effect(() => {
    /* Read reactive values to establish dependency tracking */
    const congress = currentCongress;
    const elections = showElections;

    /* Only update if map is initialized (skip initial effect before onMount) */
    if (map && map.isStyleLoaded()) {
      updateMap(congress);
    }
  });
</script>

<!-- Component layout: map + controls -->
<div class="relative w-full h-full flex flex-col">

  <!-- Map canvas -->
  <div
    class="flex-1 relative"
    bind:this={mapContainer}
    role="application"
    aria-label="Interactive map of Missouri congressional districts. Use the timeline slider below to explore different eras."
  >
    <!-- Loading overlay -->
    {#if isLoading}
      <div class="absolute inset-0 bg-white/50 flex items-center justify-center z-20">
        <div class="text-mo-navy font-semibold">Loading districts...</div>
      </div>
    {/if}

    <!-- Legend overlay (bottom-left) -->
    <div class="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg
                border border-gray-200 p-3 text-xs shadow-sm z-10">
      {#if showElections && hasElectionData}
        <div class="font-semibold mb-2 text-gray-700">Partisan Lean</div>
        <div class="flex items-center gap-1">
          <span class="text-blue-600 font-semibold">D</span>
          <div class="h-3 w-24 rounded"
               style="background: linear-gradient(to right, #2563EB, #9B59B6, #DC2626)">
          </div>
          <span class="text-red-600 font-semibold">R</span>
        </div>
      {:else}
        <div class="font-semibold mb-1 text-gray-700">District Colors</div>
        <div class="text-gray-500">Boundaries only</div>
      {/if}
    </div>
  </div>

  <!-- Controls panel below the map -->
  <div class="bg-white border-t border-gray-200 p-4">
    <!-- Status bar: congress info -->
    <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
      <div>
        <span class="font-headline font-bold text-lg text-mo-navy">
          {ordinal(currentCongress)} Congress
        </span>
        <span class="text-sm text-mo-neutral-600 ml-2">
          ({congressYears(currentCongress)})
        </span>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm text-mo-neutral-600">
          {congressInfo?.districts ?? '?'} districts
        </span>
        {#if hasElectionData}
          <span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
            Election data
          </span>
        {:else}
          <span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
            Boundaries only
          </span>
        {/if}
      </div>
    </div>

    <!-- Timeline slider -->
    <div class="flex items-center gap-3">
      <span class="text-xs text-mo-neutral-600 whitespace-nowrap">1821</span>
      <input
        type="range"
        min="17"
        max="119"
        step="1"
        bind:value={currentCongress}
        class="flex-1 accent-mo-navy h-2 cursor-pointer"
        aria-label="Select congress number"
      />
      <span class="text-xs text-mo-neutral-600 whitespace-nowrap">2025</span>
    </div>

    <!-- Toggle and mobile congress selector -->
    <div class="flex flex-wrap items-center justify-between gap-2 mt-3">
      <!-- Election data toggle -->
      <label class="flex items-center gap-2 cursor-pointer text-sm text-mo-neutral-600">
        <input
          type="checkbox"
          bind:checked={showElections}
          class="accent-mo-navy"
          aria-label="Toggle election result coloring on district map"
        />
        Show election results
      </label>

      <!-- Mobile: dropdown congress selector (hidden on desktop) -->
      <select
        bind:value={currentCongress}
        class="md:hidden text-sm border border-mo-neutral-200 rounded px-2 py-1 bg-white"
        aria-label="Select congress"
      >
        {#each congressIndex as entry}
          <option value={entry.congress}>
            {ordinal(entry.congress)} ({entry.startYear}) — {entry.districts} districts
          </option>
        {/each}
      </select>
    </div>
  </div>
</div>
