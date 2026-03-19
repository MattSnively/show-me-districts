<!--
  RedistrictingComparison.svelte — Side-by-side map comparison showing
  the current enacted (2022) congressional districts vs. the HB 1 (2025)
  mid-cycle redistricting map. Both maps sync their viewports so users
  can pan/zoom together and see how district boundaries shifted.

  Features:
    - Two synced MapLibre maps with district fill coloring
    - District labels at polygon centroids
    - Click a district for demographic popup
    - Legend showing the 8 district colors
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { MO_BOUNDS, MO_CENTER, DISTRICT_COLORS } from '../../lib/map-utils';

  /** Loading state while maps initialize */
  let isLoading = $state(true);

  /** Map container DOM elements */
  let leftContainer: HTMLDivElement;
  let rightContainer: HTMLDivElement;

  /** MapLibre map instances */
  let leftMap: maplibregl.Map | null = null;
  let rightMap: maplibregl.Map | null = null;

  /** Viewport sync flag to prevent infinite loops */
  let isSyncing = false;

  /**
   * Creates a MapLibre map centered on Missouri with OSM basemap.
   * @param container - DOM element to mount the map in
   * @returns Initialized MapLibre map instance
   */
  function createMap(container: HTMLDivElement): maplibregl.Map {
    const m = new maplibregl.Map({
      container,
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
        layers: [{
          id: 'osm-tiles',
          type: 'raster',
          source: 'osm',
          minzoom: 0,
          maxzoom: 19,
        }],
      },
      center: MO_CENTER,
      zoom: 6.5,
      maxBounds: [
        [MO_BOUNDS[0] - 1, MO_BOUNDS[1] - 0.5],
        [MO_BOUNDS[2] + 1, MO_BOUNDS[3] + 0.5],
      ],
    });

    m.addControl(new maplibregl.NavigationControl(), 'top-right');
    return m;
  }

  /**
   * Loads a GeoJSON district file and renders it on a map with
   * color-coded fills, border lines, and district number labels.
   * @param map - MapLibre map instance
   * @param url - URL to the GeoJSON file
   * @param prefix - Layer name prefix to avoid collisions between maps
   * @param districtProp - Property name containing the district number
   */
  async function loadDistricts(
    map: maplibregl.Map,
    url: string,
    prefix: string,
    districtProp: string
  ) {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`Failed to load ${url}: ${resp.status}`);
      return;
    }

    const geojson = await resp.json();

    /* Normalize district property to 'district' for consistent styling */
    for (const f of geojson.features) {
      const raw = f.properties[districtProp] || f.properties.district || f.properties.District;
      f.properties.district = parseInt(raw, 10) || 0;
    }

    map.addSource(`${prefix}-districts`, { type: 'geojson', data: geojson });

    /* District fill layer — color-coded by district number */
    map.addLayer({
      id: `${prefix}-fill`,
      type: 'fill',
      source: `${prefix}-districts`,
      paint: {
        'fill-color': [
          'match', ['get', 'district'],
          1, DISTRICT_COLORS[0],
          2, DISTRICT_COLORS[1],
          3, DISTRICT_COLORS[2],
          4, DISTRICT_COLORS[3],
          5, DISTRICT_COLORS[4],
          6, DISTRICT_COLORS[5],
          7, DISTRICT_COLORS[6],
          8, DISTRICT_COLORS[7],
          '#CCCCCC',
        ],
        'fill-opacity': 0.5,
      },
    });

    /* District border lines */
    map.addLayer({
      id: `${prefix}-line`,
      type: 'line',
      source: `${prefix}-districts`,
      paint: {
        'line-color': '#003B6F',
        'line-width': 2,
        'line-opacity': 0.8,
      },
    });

    /* District number labels */
    map.addLayer({
      id: `${prefix}-label`,
      type: 'symbol',
      source: `${prefix}-districts`,
      layout: {
        'text-field': ['to-string', ['get', 'district']],
        'text-size': 18,
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#003B6F',
        'text-halo-color': '#FFFFFF',
        'text-halo-width': 2,
      },
    });

    /* Click handler — show district info popup */
    map.on('click', `${prefix}-fill`, (e) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      const dist = props.district;
      const pop = props.population ? parseInt(props.population).toLocaleString() : 'N/A';

      /* Build demographic breakdown if available */
      let demographics = '';
      if (props.white || props.black || props.hispanic) {
        const total = parseInt(props.population) || 1;
        const pct = (val: string) => ((parseInt(val) || 0) / total * 100).toFixed(1);
        demographics = `
          <div style="margin-top:6px; font-size:11px; color:#666;">
            White: ${pct(props.white)}% · Black: ${pct(props.black)}%<br/>
            Hispanic: ${pct(props.hispanic)}% · Asian: ${pct(props.asian)}%
          </div>
        `;
      }

      new maplibregl.Popup({ closeButton: true, maxWidth: '240px' })
        .setLngLat(e.lngLat)
        .setHTML(`
          <div style="font-family: system-ui, sans-serif;">
            <div style="font-weight:bold; font-size:14px; color:#003B6F;">
              District ${dist}
            </div>
            <div style="font-size:12px; color:#333; margin-top:4px;">
              Population: ${pop}
            </div>
            ${demographics}
          </div>
        `)
        .addTo(map);
    });

    /* Hover cursor */
    map.on('mouseenter', `${prefix}-fill`, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', `${prefix}-fill`, () => {
      map.getCanvas().style.cursor = '';
    });
  }

  /**
   * Syncs the viewport between two maps, preventing infinite feedback loops.
   * @param source - The map the user is interacting with
   * @param target - The map to match
   */
  function syncMaps(source: maplibregl.Map, target: maplibregl.Map) {
    if (isSyncing) return;
    isSyncing = true;
    target.setCenter(source.getCenter());
    target.setZoom(source.getZoom());
    target.setBearing(source.getBearing());
    target.setPitch(source.getPitch());
    isSyncing = false;
  }

  onMount(() => {
    /* Initialize both maps */
    leftMap = createMap(leftContainer);
    rightMap = createMap(rightContainer);

    /* Load district data when maps are ready */
    let leftReady = false;
    let rightReady = false;

    /** Checks if both maps are loaded and sets up sync + hides loading */
    function checkBothReady() {
      if (leftReady && rightReady) {
        /* Set up bidirectional viewport sync */
        leftMap!.on('move', () => syncMaps(leftMap!, rightMap!));
        rightMap!.on('move', () => syncMaps(rightMap!, leftMap!));
        isLoading = false;
      }
    }

    leftMap.on('load', async () => {
      /* Current enacted map (2022) — uses CD119FP as district property */
      await loadDistricts(leftMap!, '/data/census/mo-cd-current.geojson', 'current', 'CD119FP');
      leftReady = true;
      checkBothReady();
    });

    rightMap.on('load', async () => {
      /* HB 1 map (2025) — uses District as district property */
      await loadDistricts(rightMap!, '/data/census/mo-cd-hb1-2025.geojson', 'hb1', 'district');
      rightReady = true;
      checkBothReady();
    });

    return () => {
      if (leftMap) leftMap.remove();
      if (rightMap) rightMap.remove();
    };
  });
</script>

<!-- Side-by-side map comparison layout -->
<div class="relative w-full h-full flex flex-col">

  <!-- Map labels bar -->
  <div class="flex border-b border-gray-200 flex-shrink-0">
    <div class="flex-1 px-4 py-2 bg-white text-center">
      <span class="text-sm font-bold text-gray-700">Current Map (2022)</span>
      <span class="text-xs text-gray-500 ml-2">6R – 2D</span>
    </div>
    <div class="w-px bg-gray-300"></div>
    <div class="flex-1 px-4 py-2 bg-white text-center">
      <span class="text-sm font-bold text-gray-700">HB 1 Map (2025)</span>
      <span class="text-xs text-gray-500 ml-2">7R – 1D</span>
    </div>
  </div>

  <!-- Maps -->
  <div class="flex-1 flex min-h-0">
    <!-- Current (2022) map -->
    <div class="flex-1 relative">
      <div
        class="absolute inset-0"
        bind:this={leftContainer}
        role="application"
        aria-label="Map of Missouri's current congressional districts enacted in 2022"
      ></div>
    </div>

    <!-- Divider -->
    <div class="w-px bg-gray-300 flex-shrink-0"></div>

    <!-- HB 1 (2025) map -->
    <div class="flex-1 relative">
      <div
        class="absolute inset-0"
        bind:this={rightContainer}
        role="application"
        aria-label="Map of Missouri's HB 1 congressional districts enacted in 2025"
      ></div>
    </div>
  </div>

  <!-- Loading overlay -->
  {#if isLoading}
    <div class="absolute inset-0 bg-white/70 flex items-center justify-center z-20">
      <div class="text-center">
        <div class="text-mo-navy font-semibold mb-1">Loading district maps...</div>
        <div class="text-xs text-gray-500">Comparing 2022 and 2025 boundaries</div>
      </div>
    </div>
  {/if}

  <!-- Shared district color legend -->
  <div class="absolute bottom-2 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm
              rounded px-3 py-2 shadow-sm z-10">
    <div class="flex flex-wrap gap-2 items-center justify-center">
      <span class="text-[10px] text-gray-500 uppercase tracking-wide mr-1">Districts:</span>
      {#each DISTRICT_COLORS as color, i}
        <div class="flex items-center gap-1">
          <div class="w-3 h-3 rounded-sm" style="background-color: {color};"></div>
          <span class="text-[10px] text-gray-600">{i + 1}</span>
        </div>
      {/each}
    </div>
    <div class="text-[10px] text-gray-400 text-center mt-1">Click a district for demographics</div>
  </div>
</div>
