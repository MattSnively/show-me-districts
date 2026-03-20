<!--
  FairMapViewer.svelte — Browse and compare pre-computed fair district plans.
  Displays plans on MapLibre maps with side-by-side comparison mode and
  metric scoring tables. Loads curated plans from ensemble-metadata.json
  and shows the current enacted map as a baseline.

  Features:
    - Plan browser sidebar with metric scores per plan
    - Single map view with selected plan rendered
    - Side-by-side comparison mode (synced viewports)
    - Sortable metric table for plan comparison
    - Handles gracefully when no community plans are available yet
    - Import placeholder for user-created maps from the editor
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { MO_BOUNDS, MO_CENTER, DISTRICT_COLORS } from '../../lib/map-utils';
  import DistrictMetrics from './DistrictMetrics.svelte';

  /* ---- Types ---- */

  /** Metric scores for a district plan */
  interface PlanMetrics {
    polsbyPopper: number | null;
    reock: number | null;
    populationDeviation: number | null;
    efficiencyGap: number | null;
    meanMedian: number | null;
  }

  /** A single district plan entry from ensemble-metadata.json */
  interface PlanEntry {
    id: string;
    title: string;
    source: string;
    year: number;
    districts: number;
    geoFile: string;
    metrics: PlanMetrics;
    note?: string;
  }

  /** Full metadata structure from ensemble-metadata.json */
  interface EnsembleMetadata {
    description: string;
    baseline: PlanEntry;
    plans: PlanEntry[];
    note?: string;
  }

  /* ---- State ---- */

  /** Metadata loaded from ensemble-metadata.json */
  let metadata = $state<EnsembleMetadata | null>(null);

  /** All available plans (baseline + community), combined for easy access */
  let allPlans = $derived<PlanEntry[]>(
    metadata ? [metadata.baseline, ...metadata.plans] : []
  );

  /** ID of the currently selected plan (displayed on left/single map) */
  let selectedPlanId = $state<string>('enacted-2022');

  /** ID of the comparison plan (displayed on right map), null = single view */
  let comparisonPlanId = $state<string | null>(null);

  /** Whether comparison mode is active */
  let isComparing = $derived(comparisonPlanId !== null);

  /** Loading states */
  let isLoading = $state(true);
  let loadingMessage = $state('Loading plan data...');

  /** Sorting for the plan table */
  let sortColumn = $state<string>('title');
  let sortAscending = $state(true);

  /** Cached GeoJSON data keyed by plan ID */
  let geoCache = new Map<string, any>();

  /** MapLibre map instances */
  let leftMapContainer: HTMLDivElement;
  let rightMapContainer: HTMLDivElement;
  let leftMap: maplibregl.Map | null = null;
  let rightMap: maplibregl.Map | null = null;

  /** Whether viewport sync is active (prevents infinite sync loops) */
  let isSyncing = false;

  /* ---- Derived plan lookups ---- */

  /** Currently selected plan object */
  let selectedPlan = $derived(allPlans.find(p => p.id === selectedPlanId) ?? null);

  /** Comparison plan object (null if not comparing) */
  let comparisonPlan = $derived(
    comparisonPlanId ? allPlans.find(p => p.id === comparisonPlanId) ?? null : null
  );

  /* ---- Sorted plan list for the table ---- */

  /** Plans sorted by the selected column */
  let sortedPlans = $derived.by(() => {
    const plans = [...allPlans];
    plans.sort((a, b) => {
      let aVal: any, bVal: any;

      /* Pick the right field to sort by */
      if (sortColumn === 'title') {
        aVal = a.title.toLowerCase();
        bVal = b.title.toLowerCase();
      } else if (sortColumn === 'source') {
        aVal = a.source.toLowerCase();
        bVal = b.source.toLowerCase();
      } else if (sortColumn === 'year') {
        aVal = a.year;
        bVal = b.year;
      } else {
        /* Metric columns — null sorts last */
        aVal = (a.metrics as any)[sortColumn] ?? Infinity;
        bVal = (b.metrics as any)[sortColumn] ?? Infinity;
      }

      if (aVal < bVal) return sortAscending ? -1 : 1;
      if (aVal > bVal) return sortAscending ? 1 : -1;
      return 0;
    });
    return plans;
  });

  /* ---- Map initialization and rendering ---- */

  /**
   * Creates a MapLibre map instance with OSM basemap, centered on Missouri.
   * @param container - DOM element to mount the map in
   * @returns Initialized MapLibre map
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
   * Loads a plan's GeoJSON (from cache or network), adds it as a source and
   * renders it on the given map. Uses distinct colors per district number.
   * @param map - MapLibre map instance
   * @param plan - Plan entry with geoFile path
   * @param prefix - Layer name prefix ('left' or 'right') to avoid collisions
   */
  async function renderPlanOnMap(map: maplibregl.Map, plan: PlanEntry, prefix: string) {
    /* Remove existing plan layers/sources for this prefix */
    const fillId = `${prefix}-plan-fill`;
    const lineId = `${prefix}-plan-line`;
    const labelId = `${prefix}-plan-label`;

    if (map.getLayer(labelId)) map.removeLayer(labelId);
    if (map.getLayer(lineId)) map.removeLayer(lineId);
    if (map.getLayer(fillId)) map.removeLayer(fillId);
    if (map.getSource(`${prefix}-plan`)) map.removeSource(`${prefix}-plan`);

    /* Resolve the GeoJSON file path.
     * Paths in ensemble-metadata.json are relative to data/fair-maps/,
     * but we serve from public/data/, so we normalize them. */
    let geoPath = plan.geoFile;
    if (geoPath.startsWith('../')) {
      geoPath = '/data/' + geoPath.replace(/^\.\.\//, '');
    } else if (!geoPath.startsWith('/')) {
      geoPath = '/data/fair-maps/' + geoPath;
    }

    /* Load GeoJSON (cached if already fetched) */
    let geojson = geoCache.get(plan.id);
    if (!geojson) {
      const resp = await fetch(geoPath);
      if (!resp.ok) {
        console.error(`Failed to load plan GeoJSON: ${geoPath}`);
        return;
      }
      geojson = await resp.json();
      geoCache.set(plan.id, geojson);
    }

    /* Assign district numbers to features if not already present.
     * The current CD file uses CD119FP property; others may use 'district'. */
    for (let i = 0; i < geojson.features.length; i++) {
      const props = geojson.features[i].properties || {};
      if (props.district === undefined) {
        /* Try CD119FP (Census TIGER field) or DISTRICT or index+1 */
        const distNum = parseInt(props.CD119FP || props.CD118FP || props.DISTRICT || props.districtNum || (i + 1), 10);
        geojson.features[i].properties = { ...props, district: distNum };
      }
    }

    /* Add source and layers */
    map.addSource(`${prefix}-plan`, {
      type: 'geojson',
      data: geojson,
    });

    /* Fill layer — color by district number */
    map.addLayer({
      id: fillId,
      type: 'fill',
      source: `${prefix}-plan`,
      paint: {
        'fill-color': [
          'match',
          ['coalesce', ['get', 'district'], 0],
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
        'fill-opacity': 0.55,
      },
    });

    /* Border lines */
    map.addLayer({
      id: lineId,
      type: 'line',
      source: `${prefix}-plan`,
      paint: {
        'line-color': '#003B6F',
        'line-width': 2,
        'line-opacity': 0.8,
      },
    });

    /* District number labels at centroids */
    map.addLayer({
      id: labelId,
      type: 'symbol',
      source: `${prefix}-plan`,
      layout: {
        'text-field': ['to-string', ['get', 'district']],
        'text-size': 16,
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#003B6F',
        'text-halo-color': '#FFFFFF',
        'text-halo-width': 2,
      },
    });
  }

  /**
   * Syncs the viewport (center, zoom, bearing, pitch) between two maps.
   * Prevents infinite sync loops with a flag.
   * @param source - The map that moved
   * @param target - The map to sync to
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

  /**
   * Sets up viewport syncing between left and right maps.
   * Both maps follow each other's pan/zoom actions.
   */
  function setupMapSync() {
    if (!leftMap || !rightMap) return;

    leftMap.on('move', () => {
      if (rightMap) syncMaps(leftMap!, rightMap);
    });
    rightMap.on('move', () => {
      if (leftMap) syncMaps(rightMap!, leftMap!);
    });
  }

  /**
   * Handles selecting a plan from the browser.
   * If no comparison is active, shows it on the main map.
   */
  function selectPlan(planId: string) {
    selectedPlanId = planId;
  }

  /**
   * Starts comparison mode between the selected plan and another.
   * @param planId - The plan to compare against the selected plan
   */
  function startComparison(planId: string) {
    if (planId === selectedPlanId) return;
    comparisonPlanId = planId;
  }

  /** Exits comparison mode, destroys the right map */
  function exitComparison() {
    comparisonPlanId = null;
    if (rightMap) {
      rightMap.remove();
      rightMap = null;
    }
  }

  /**
   * Toggles sort order when clicking a column header.
   * Clicking the same column reverses direction; new column sorts ascending.
   */
  function toggleSort(column: string) {
    if (sortColumn === column) {
      sortAscending = !sortAscending;
    } else {
      sortColumn = column;
      sortAscending = true;
    }
  }

  /**
   * Formats a metric value for display in the table.
   * Returns '—' for null values, percentages for deviation/gap metrics.
   */
  function formatMetric(value: number | null, isPercent = false): string {
    if (value === null || value === undefined) return '—';
    if (isPercent) return `${(value * 100).toFixed(1)}%`;
    return value.toFixed(3);
  }

  /**
   * Returns a CSS class for metric value coloring.
   * Green = good, yellow = acceptable, red = concerning.
   */
  function metricClass(value: number | null, good: number, warn: number, invert = false): string {
    if (value === null) return 'text-gray-400';
    const abs = Math.abs(value);
    if (invert) {
      /* Higher is better (compactness) */
      if (abs >= good) return 'text-green-600';
      if (abs >= warn) return 'text-yellow-600';
      return 'text-red-600';
    }
    /* Lower is better (deviation, gaps) */
    if (abs <= good) return 'text-green-600';
    if (abs <= warn) return 'text-yellow-600';
    return 'text-red-600';
  }

  /* ---- Lifecycle ---- */

  onMount(async () => {
    /* Load ensemble metadata */
    try {
      const resp = await fetch('/data/fair-maps/ensemble-metadata.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      metadata = await resp.json();
    } catch (err) {
      console.error('Failed to load ensemble metadata:', err);
      loadingMessage = 'Failed to load plan data';
      isLoading = false;
      return;
    }

    /* Initialize left (primary) map */
    leftMap = createMap(leftMapContainer);

    leftMap.on('load', async () => {
      if (!leftMap || !selectedPlan) return;
      await renderPlanOnMap(leftMap, selectedPlan, 'left');
      isLoading = false;
      loadingMessage = '';
    });

    return () => {
      if (leftMap) leftMap.remove();
      if (rightMap) rightMap.remove();
    };
  });

  /**
   * Reacts to plan selection changes — re-renders the selected plan on the left map.
   * Uses $effect to watch for selectedPlan changes after initial mount.
   */
  $effect(() => {
    if (!leftMap || !selectedPlan) return;

    /* Wait for map to be loaded before rendering */
    if (!leftMap.isStyleLoaded()) return;

    renderPlanOnMap(leftMap, selectedPlan, 'left');
  });

  /**
   * Reacts to comparison plan changes — creates or destroys the right map.
   * When a comparison plan is selected, initializes the right map with synced viewport.
   */
  $effect(() => {
    if (isComparing && comparisonPlan && !rightMap && rightMapContainer) {
      /* Create right map for comparison */
      rightMap = createMap(rightMapContainer);

      /* Sync initial viewport from left map */
      if (leftMap) {
        rightMap.setCenter(leftMap.getCenter());
        rightMap.setZoom(leftMap.getZoom());
      }

      rightMap.on('load', async () => {
        if (!rightMap || !comparisonPlan) return;
        await renderPlanOnMap(rightMap, comparisonPlan, 'right');
        setupMapSync();
      });
    }

    /* If comparison plan changed but right map already exists, re-render */
    if (isComparing && comparisonPlan && rightMap && rightMap.isStyleLoaded()) {
      renderPlanOnMap(rightMap, comparisonPlan, 'right');
    }
  });
</script>

<!-- Component layout: plan browser panel + map area -->
<div class="relative w-full h-full flex flex-col">

  <!-- Top bar: view controls -->
  <div class="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0">
    <div class="flex items-center gap-3">
      <h3 class="text-sm font-bold text-gray-700 uppercase tracking-wide">
        {isComparing ? 'Comparing Plans' : 'Viewing Plan'}
      </h3>
      {#if selectedPlan}
        <span class="text-sm text-gray-500">
          {selectedPlan.title}
          {#if isComparing && comparisonPlan}
            <span class="text-gray-400 mx-1">vs</span>
            {comparisonPlan.title}
          {/if}
        </span>
      {/if}
    </div>
    <div class="flex items-center gap-2">
      {#if isComparing}
        <button
          class="px-3 py-1.5 text-xs font-medium rounded border border-gray-300
                 hover:bg-gray-50 transition-colors"
          onclick={exitComparison}
        >
          Exit Comparison
        </button>
      {/if}
    </div>
  </div>

  <!-- Main content: map(s) + sidebar -->
  <div class="flex-1 flex flex-col md:flex-row min-h-0">

    <!-- Map area — bind MapLibre directly to the flex children so they get
         real pixel dimensions from the flex layout (no extra absolute wrapper) -->
    <div class="flex-1 relative order-1 min-h-[300px]">
      <!-- Left / primary map — fills the whole area (or half in compare mode) -->
      <div
        class="absolute inset-0 {isComparing ? 'right-1/2' : ''}"
        bind:this={leftMapContainer}
        role="application"
        aria-label="Map showing {selectedPlan?.title ?? 'district plan'}"
      ></div>

      <!-- Plan label overlay -->
      {#if selectedPlan}
        <div class="absolute top-2 left-2 bg-white/90 backdrop-blur-sm rounded
                    px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm z-10">
          {selectedPlan.title}
        </div>
      {/if}

      <!-- Loading overlay -->
      {#if isLoading}
        <div class="absolute inset-0 bg-white/70 flex items-center justify-center z-20">
          <div class="text-center">
            <div class="text-mo-navy font-semibold mb-1">{loadingMessage}</div>
            <div class="text-xs text-gray-500">Loading district boundaries...</div>
          </div>
        </div>
      {/if}

      <!-- Right / comparison map (only visible in compare mode) -->
      {#if isComparing}
        <div
          class="absolute inset-0 left-1/2"
          bind:this={rightMapContainer}
          role="application"
          aria-label="Comparison map showing {comparisonPlan?.title ?? 'comparison plan'}"
        ></div>

        <!-- Comparison plan label -->
        {#if comparisonPlan}
          <div class="absolute top-2 bg-white/90 backdrop-blur-sm rounded
                      px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm z-10"
               style="left: calc(50% + 0.5rem);">
            {comparisonPlan.title}
          </div>
        {/if}

        <!-- Divider line -->
        <div class="absolute top-0 bottom-0 left-1/2 w-px bg-gray-300 z-10"></div>
      {/if}

      <!-- District color legend (bottom-left of map) -->
      <div class="absolute bottom-2 left-2 bg-white/90 backdrop-blur-sm rounded
                  px-3 py-2 shadow-sm z-10">
        <div class="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Districts</div>
        <div class="flex flex-wrap gap-1.5">
          {#each DISTRICT_COLORS as color, i}
            <div class="flex items-center gap-1">
              <div class="w-3 h-3 rounded-sm" style="background-color: {color};"></div>
              <span class="text-[10px] text-gray-600">{i + 1}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <!-- Sidebar: plan browser + metrics -->
    <div class="w-full md:w-80 bg-white border-t md:border-t-0 md:border-l border-gray-200
                overflow-y-auto flex-shrink-0 order-2">
      <div class="p-4">
        <!-- Plan browser header -->
        <h3 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">
          Available Plans
        </h3>

        <!-- Plan cards -->
        {#each sortedPlans as plan}
          {@const isSelected = plan.id === selectedPlanId}
          {@const isCompared = plan.id === comparisonPlanId}
          <div
            class="mb-2 p-3 rounded border transition-all cursor-pointer
                   {isSelected ? 'border-mo-navy bg-mo-navy/5 ring-1 ring-mo-navy' :
                    isCompared ? 'border-mo-gold bg-mo-gold/5 ring-1 ring-mo-gold' :
                    'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}"
            role="button"
            tabindex="0"
            aria-label="Select plan: {plan.title}"
            aria-pressed={isSelected}
            onclick={() => selectPlan(plan.id)}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), selectPlan(plan.id))}
          >
            <!-- Plan title and source -->
            <div class="flex items-start justify-between mb-1">
              <div>
                <div class="text-sm font-semibold text-gray-800">{plan.title}</div>
                <div class="text-[10px] text-gray-500">{plan.source} &middot; {plan.year}</div>
              </div>
              {#if isSelected}
                <span class="text-[10px] font-bold text-mo-navy uppercase">Selected</span>
              {:else if isCompared}
                <span class="text-[10px] font-bold text-mo-gold uppercase">Comparing</span>
              {/if}
            </div>

            <!-- Quick metrics row -->
            <div class="flex gap-3 mt-2 text-[10px]">
              <div>
                <span class="text-gray-400">PP:</span>
                <span class="{metricClass(plan.metrics.polsbyPopper, 0.3, 0.2, true)} font-mono">
                  {formatMetric(plan.metrics.polsbyPopper)}
                </span>
              </div>
              <div>
                <span class="text-gray-400">Dev:</span>
                <span class="{metricClass(plan.metrics.populationDeviation, 0.01, 0.05)} font-mono">
                  {formatMetric(plan.metrics.populationDeviation, true)}
                </span>
              </div>
              <div>
                <span class="text-gray-400">EG:</span>
                <span class="{metricClass(plan.metrics.efficiencyGap, 0.04, 0.08)} font-mono">
                  {formatMetric(plan.metrics.efficiencyGap, true)}
                </span>
              </div>
            </div>

            <!-- Comparison button (shown when plan is not already selected/compared) -->
            {#if !isSelected && !isCompared}
              <button
                class="mt-2 w-full px-2 py-1 text-[10px] font-medium rounded border border-gray-300
                       hover:bg-mo-navy hover:text-white hover:border-mo-navy transition-colors"
                onclick={(e) => { e.stopPropagation(); startComparison(plan.id); }}
              >
                Compare with {allPlans.find(p => p.id === selectedPlanId)?.title || 'selected'}
              </button>
            {/if}
          </div>
        {/each}

        <!-- Empty state: no community plans yet -->
        {#if metadata && metadata.plans.length === 0}
          <div class="mt-3 p-4 rounded-lg bg-mo-neutral-100 border border-dashed border-gray-300">
            <p class="text-sm font-semibold text-gray-700 mb-1">Community Plans Coming Soon</p>
            <p class="text-xs text-gray-500 leading-relaxed">
              We're sourcing community-created district plans from Dave's Redistricting App
              and other tools. Check back soon to compare alternatives!
            </p>
            <p class="text-xs text-gray-500 mt-2 leading-relaxed">
              In the meantime, you can
              <a href="/editor" class="text-mo-navy underline hover:text-mo-navy-light">
                draw your own map
              </a>
              using our district editor.
            </p>
          </div>
        {/if}

        <!-- Metrics detail panel for selected plan -->
        {#if selectedPlan}
          <div class="mt-4 pt-4 border-t border-gray-200">
            <h3 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
              {selectedPlan.title} — Metrics
            </h3>
            <DistrictMetrics
              polsbyPopper={selectedPlan.metrics.polsbyPopper ?? 0}
              reock={selectedPlan.metrics.reock ?? 0}
              populationDeviation={selectedPlan.metrics.populationDeviation ?? 0}
              efficiencyGap={selectedPlan.metrics.efficiencyGap ?? 0}
              meanMedian={selectedPlan.metrics.meanMedian ?? 0}
              compact={true}
            />
            {#if selectedPlan.metrics.polsbyPopper === null}
              <p class="text-[10px] text-gray-400 mt-1 text-center italic">
                Metrics pending computation
              </p>
            {/if}
          </div>
        {/if}

        <!-- Comparison plan metrics -->
        {#if isComparing && comparisonPlan}
          <div class="mt-4 pt-4 border-t border-gray-200">
            <h3 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
              {comparisonPlan.title} — Metrics
            </h3>
            <DistrictMetrics
              polsbyPopper={comparisonPlan.metrics.polsbyPopper ?? 0}
              reock={comparisonPlan.metrics.reock ?? 0}
              populationDeviation={comparisonPlan.metrics.populationDeviation ?? 0}
              efficiencyGap={comparisonPlan.metrics.efficiencyGap ?? 0}
              meanMedian={comparisonPlan.metrics.meanMedian ?? 0}
              compact={true}
            />
            {#if comparisonPlan.metrics.polsbyPopper === null}
              <p class="text-[10px] text-gray-400 mt-1 text-center italic">
                Metrics pending computation
              </p>
            {/if}
          </div>
        {/if}

        <!-- Import from editor placeholder -->
        <div class="mt-4 pt-4 border-t border-gray-200">
          <a
            href="/editor"
            class="block w-full px-3 py-2 text-sm font-medium text-center rounded
                   bg-mo-navy text-white hover:bg-mo-navy-light transition-colors"
          >
            Create Your Own Plan
          </a>
          <p class="text-[10px] text-gray-400 mt-1 text-center">
            Draw districts in the editor and compare here
          </p>
        </div>
      </div>
    </div>
  </div>
</div>
