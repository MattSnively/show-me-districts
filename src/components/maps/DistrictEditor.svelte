<!--
  DistrictEditor.svelte — Interactive census tract painting tool for creating
  custom congressional district plans. Users select a district color slot,
  click or drag over census tracts to assign them, and see real-time
  population counters and deviation metrics.

  Features:
    - 8 color-coded district slots in a sidebar
    - Click or drag-paint census tracts onto the active district
    - Real-time population counter per district with deviation bar
    - Undo/redo stack (50 actions)
    - Reset to blank map
    - Save/load placeholder (Supabase integration deferred until account setup)
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { MO_BOUNDS, MO_CENTER, MO_DISTRICT_COUNT, DISTRICT_COLORS } from '../../lib/map-utils';
  import { populationDeviation } from '../../lib/metrics';

  /** Currently selected district slot (1-8, 0 = eraser/unassign) */
  let activeDistrict = $state(1);

  /** Whether the user is actively painting (mouse held down) */
  let isPainting = $state(false);

  /** Title for saving the map */
  let mapTitle = $state('Untitled Plan');

  /** Loading state for initial tract data fetch */
  let isLoading = $state(true);

  /** Status message for user feedback */
  let statusMessage = $state('Loading census tracts...');

  /** Map reference */
  let mapContainer: HTMLDivElement;
  let map: maplibregl.Map | null = null;

  /**
   * District assignments: maps tract GEOID → district number (1-8, 0 = unassigned).
   * This is the core state that drives all rendering and metrics.
   */
  let assignments: Map<string, number> = $state(new Map());

  /**
   * Tract population lookup: maps GEOID → population count.
   * Loaded once from the GeoJSON and never changes.
   */
  let tractPopulations: Map<string, number> = new Map();

  /** Total state population (from GeoJSON metadata) */
  let totalPopulation = $state(0);

  /** Ideal population per district */
  let idealPop = $derived(Math.round(totalPopulation / MO_DISTRICT_COUNT));

  /**
   * Population per district, computed reactively from assignments.
   * Index 0 = unassigned, indices 1-8 = districts.
   */
  let districtPops = $derived.by(() => {
    const pops = new Array(MO_DISTRICT_COUNT + 1).fill(0);
    for (const [geoid, dist] of assignments) {
      pops[dist] += tractPopulations.get(geoid) || 0;
    }
    return pops;
  });

  /** Max population deviation as a percentage */
  let maxDeviation = $derived(
    idealPop > 0
      ? populationDeviation(districtPops.slice(1).filter((p) => p > 0))
      : 0
  );

  /** Count of assigned tracts (not district 0) */
  let assignedCount = $derived(
    [...assignments.values()].filter((d) => d > 0).length
  );

  /** Total tract count */
  let totalTracts = $state(0);

  /* ---- Undo/Redo Stack ---- */

  /** Each undo entry records which tracts changed and their previous district */
  interface UndoEntry {
    changes: Array<{ geoid: string; oldDistrict: number; newDistrict: number }>;
  }

  let undoStack: UndoEntry[] = $state([]);
  let redoStack: UndoEntry[] = $state([]);
  const MAX_UNDO = 50;

  /** Tracks changes during a single paint stroke (mousedown → mouseup) */
  let currentStroke: Array<{ geoid: string; oldDistrict: number; newDistrict: number }> = [];

  /**
   * Assigns a tract to the active district and tracks the change for undo.
   * Skips if the tract is already assigned to this district.
   */
  function paintTract(geoid: string) {
    const oldDistrict = assignments.get(geoid) ?? 0;
    if (oldDistrict === activeDistrict) return;

    /* Record change in current stroke */
    currentStroke.push({ geoid, oldDistrict, newDistrict: activeDistrict });

    /* Update assignment — create new Map for reactivity */
    const updated = new Map(assignments);
    updated.set(geoid, activeDistrict);
    assignments = updated;

    /* Update the map layer colors */
    updateTractColor(geoid, activeDistrict);
  }

  /**
   * Commits the current paint stroke to the undo stack.
   * Called on mouseup after a paint operation.
   */
  function commitStroke() {
    if (currentStroke.length === 0) return;

    undoStack = [...undoStack.slice(-(MAX_UNDO - 1)), { changes: [...currentStroke] }];
    redoStack = []; // Clear redo on new action
    currentStroke = [];
  }

  /** Undoes the last paint stroke */
  function undo() {
    if (undoStack.length === 0) return;

    const entry = undoStack[undoStack.length - 1];
    undoStack = undoStack.slice(0, -1);

    /* Revert all changes in this stroke */
    const updated = new Map(assignments);
    for (const { geoid, oldDistrict } of entry.changes) {
      updated.set(geoid, oldDistrict);
      updateTractColor(geoid, oldDistrict);
    }
    assignments = updated;

    /* Push to redo */
    redoStack = [...redoStack, entry];
  }

  /** Redoes the last undone stroke */
  function redo() {
    if (redoStack.length === 0) return;

    const entry = redoStack[redoStack.length - 1];
    redoStack = redoStack.slice(0, -1);

    /* Re-apply all changes */
    const updated = new Map(assignments);
    for (const { geoid, newDistrict } of entry.changes) {
      updated.set(geoid, newDistrict);
      updateTractColor(geoid, newDistrict);
    }
    assignments = updated;

    undoStack = [...undoStack, entry];
  }

  /** Resets all tract assignments to unassigned (0) */
  function resetAll() {
    if (!confirm('Clear all district assignments? This cannot be undone.')) return;

    const updated = new Map<string, number>();
    for (const geoid of assignments.keys()) {
      updated.set(geoid, 0);
      updateTractColor(geoid, 0);
    }
    assignments = updated;
    undoStack = [];
    redoStack = [];
    statusMessage = 'Map cleared';
  }

  /**
   * Updates the fill color of a single tract on the map.
   * Uses setFeatureState for efficient per-feature styling.
   */
  function updateTractColor(geoid: string, district: number) {
    if (!map) return;
    map.setFeatureState(
      { source: 'tracts', id: geoid },
      { district }
    );
  }

  /**
   * Returns the fill color for a district number.
   * 0 = unassigned (light gray), 1-8 = district colors.
   */
  function districtColor(dist: number): string {
    if (dist === 0) return '#E5E5E5';
    return DISTRICT_COLORS[(dist - 1) % DISTRICT_COLORS.length];
  }

  /**
   * Computes the population deviation percentage for a single district.
   * Returns a signed value: positive = over ideal, negative = under.
   */
  function deviationPct(pop: number): number {
    if (idealPop === 0) return 0;
    return ((pop - idealPop) / idealPop) * 100;
  }

  /**
   * Initializes the MapLibre map, loads tract GeoJSON, and sets up
   * painting interactions (click, drag, hover).
   */
  onMount(() => {
    map = new maplibregl.Map({
      container: mapContainer,
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
      zoom: 6.5,
      maxBounds: [
        [MO_BOUNDS[0] - 1, MO_BOUNDS[1] - 0.5],
        [MO_BOUNDS[2] + 1, MO_BOUNDS[3] + 0.5],
      ],
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', async () => {
      await loadTracts();
    });

    return () => {
      if (map) map.remove();
    };
  });

  /**
   * Fetches the census tract GeoJSON, adds it as a map source with
   * feature-state-driven styling, and sets up paint interactions.
   */
  async function loadTracts() {
    if (!map) return;

    statusMessage = 'Loading census tracts...';

    const response = await fetch('/data/census/mo-tracts-2020.geojson');
    if (!response.ok) {
      statusMessage = 'Failed to load tract data';
      isLoading = false;
      return;
    }

    const geojson = await response.json();
    totalPopulation = geojson.properties?.totalPopulation || 0;
    totalTracts = geojson.features.length;

    /* Build population lookup and initial assignments.
     * Set each feature's `id` to its GEOID for setFeatureState to work. */
    const initialAssignments = new Map<string, number>();

    for (const feature of geojson.features) {
      const geoid = feature.properties.geoid;
      const pop = feature.properties.population || 0;
      tractPopulations.set(geoid, pop);
      initialAssignments.set(geoid, 0);

      /* MapLibre requires a numeric or string `id` on each feature for feature state */
      feature.id = geoid;
    }

    assignments = initialAssignments;

    /* Add tract source */
    map.addSource('tracts', {
      type: 'geojson',
      data: geojson,
      promoteId: 'geoid',
    });

    /* Tract fill layer — color driven by feature state */
    map.addLayer({
      id: 'tracts-fill',
      type: 'fill',
      source: 'tracts',
      paint: {
        'fill-color': [
          'match',
          ['coalesce', ['feature-state', 'district'], 0],
          0, '#E5E5E5',
          1, DISTRICT_COLORS[0],
          2, DISTRICT_COLORS[1],
          3, DISTRICT_COLORS[2],
          4, DISTRICT_COLORS[3],
          5, DISTRICT_COLORS[4],
          6, DISTRICT_COLORS[5],
          7, DISTRICT_COLORS[6],
          8, DISTRICT_COLORS[7],
          '#E5E5E5',
        ],
        'fill-opacity': 0.65,
      },
    });

    /* Tract border lines */
    map.addLayer({
      id: 'tracts-line',
      type: 'line',
      source: 'tracts',
      paint: {
        'line-color': '#737373',
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          6, 0.1,
          8, 0.3,
          10, 0.8,
        ],
        'line-opacity': 0.5,
      },
    });

    /* Hover highlight layer */
    map.addLayer({
      id: 'tracts-hover',
      type: 'line',
      source: 'tracts',
      paint: {
        'line-color': '#D4A843',
        'line-width': 2.5,
        'line-opacity': 0.9,
      },
      filter: ['==', 'geoid', ''],
    });

    /* Also load current congressional district boundaries as a reference overlay */
    try {
      const cdResponse = await fetch('/data/census/mo-cd-current.geojson');
      if (cdResponse.ok) {
        const cdGeojson = await cdResponse.json();
        map.addSource('current-cd', { type: 'geojson', data: cdGeojson });
        map.addLayer({
          id: 'current-cd-line',
          type: 'line',
          source: 'current-cd',
          paint: {
            'line-color': '#003B6F',
            'line-width': 2,
            'line-dasharray': [4, 3],
            'line-opacity': 0.4,
          },
        });
      }
    } catch {
      /* Non-critical: current CD overlay is optional */
    }

    /* Set up paint interactions */
    setupPaintHandlers();

    isLoading = false;
    statusMessage = `${totalTracts} tracts loaded. Pick a district and start painting!`;
  }

  /**
   * Wires up mouse/touch event handlers for the painting interaction.
   * Click paints a single tract; click+drag paints continuously.
   */
  function setupPaintHandlers() {
    if (!map) return;

    /* Hover: highlight tract under cursor and show pointer */
    map.on('mousemove', 'tracts-fill', (e) => {
      if (!map || !e.features || e.features.length === 0) return;
      map.getCanvas().style.cursor = 'crosshair';
      const geoid = e.features[0].properties?.geoid;
      if (geoid) {
        map.setFilter('tracts-hover', ['==', 'geoid', geoid]);
      }

      /* Paint while dragging */
      if (isPainting && geoid) {
        paintTract(geoid);
      }
    });

    map.on('mouseleave', 'tracts-fill', () => {
      if (!map) return;
      map.getCanvas().style.cursor = '';
      map.setFilter('tracts-hover', ['==', 'geoid', '']);
    });

    /* Click: paint single tract */
    map.on('click', 'tracts-fill', (e) => {
      if (!e.features || e.features.length === 0) return;
      const geoid = e.features[0].properties?.geoid;
      if (geoid) {
        paintTract(geoid);
        commitStroke();
      }
    });

    /* Drag painting: mousedown starts, mouseup commits */
    map.on('mousedown', 'tracts-fill', (e) => {
      /* Only start drag-paint on left mouse button */
      if (e.originalEvent.button !== 0) return;

      isPainting = true;
      currentStroke = [];

      /* Disable map dragging while painting */
      map!.dragPan.disable();

      const geoid = e.features?.[0]?.properties?.geoid;
      if (geoid) {
        paintTract(geoid);
      }
    });

    /* Global mouseup to catch releases outside the map */
    const handleMouseUp = () => {
      if (isPainting) {
        isPainting = false;
        commitStroke();
        map?.dragPan.enable();
      }
    };

    map.getCanvas().addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseup', handleMouseUp);
  }

  /**
   * Keyboard shortcut handler for undo (Ctrl+Z) and redo (Ctrl+Y / Ctrl+Shift+Z).
   */
  function handleKeydown(e: KeyboardEvent) {
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (e.ctrlKey && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Editor layout: sidebar + map -->
<div class="relative w-full h-full flex flex-col md:flex-row">

  <!-- Sidebar: district palette + population stats -->
  <div class="w-full md:w-72 bg-white border-b md:border-b-0 md:border-r border-gray-200
              overflow-y-auto flex-shrink-0 order-2 md:order-1">
    <div class="p-4">
      <!-- District palette header -->
      <h3 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">
        Districts
      </h3>

      <!-- Eraser tool -->
      <button
        class="w-full mb-2 px-3 py-2 rounded text-sm text-left flex items-center gap-2 transition-colors
               {activeDistrict === 0 ? 'bg-gray-200 ring-2 ring-gray-400 font-semibold' : 'hover:bg-gray-100'}"
        onclick={() => activeDistrict = 0}
      >
        <div class="w-5 h-5 rounded border-2 border-dashed border-gray-400 bg-white"></div>
        <span class="text-gray-600">Eraser (unassign)</span>
      </button>

      <!-- District color slots 1-8 -->
      {#each Array(MO_DISTRICT_COUNT) as _, i}
        {@const distNum = i + 1}
        {@const pop = districtPops[distNum]}
        {@const dev = deviationPct(pop)}
        {@const devAbs = Math.abs(dev)}
        <button
          class="w-full mb-1 px-3 py-2 rounded text-sm text-left transition-colors
                 {activeDistrict === distNum ? 'ring-2 ring-offset-1 font-semibold' : 'hover:bg-gray-50'}"
          style="
            {activeDistrict === distNum ? `ring-color: ${DISTRICT_COLORS[i]}; background-color: ${DISTRICT_COLORS[i]}15;` : ''}
          "
          onclick={() => activeDistrict = distNum}
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div
                class="w-5 h-5 rounded"
                style="background-color: {DISTRICT_COLORS[i]};"
              ></div>
              <span>District {distNum}</span>
            </div>
            <span class="text-xs text-gray-500 font-mono">
              {pop > 0 ? pop.toLocaleString() : '—'}
            </span>
          </div>

          <!-- Population deviation bar -->
          {#if pop > 0}
            <div class="mt-1 flex items-center gap-1">
              <div class="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  style="
                    width: {Math.min(100, (pop / idealPop) * 100)}%;
                    background-color: {devAbs < 1 ? '#22C55E' : devAbs < 5 ? '#F59E0B' : '#EF4444'};
                  "
                ></div>
              </div>
              <span class="text-[10px] font-mono {devAbs < 1 ? 'text-green-600' : devAbs < 5 ? 'text-yellow-600' : 'text-red-600'}">
                {dev > 0 ? '+' : ''}{dev.toFixed(1)}%
              </span>
            </div>
          {/if}
        </button>
      {/each}

      <!-- Summary stats -->
      <div class="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500 space-y-1">
        <div class="flex justify-between">
          <span>Tracts assigned:</span>
          <span class="font-mono">{assignedCount} / {totalTracts}</span>
        </div>
        <div class="flex justify-between">
          <span>Ideal per district:</span>
          <span class="font-mono">{idealPop.toLocaleString()}</span>
        </div>
        <div class="flex justify-between">
          <span>Max deviation:</span>
          <span class="font-mono {maxDeviation < 0.01 ? 'text-green-600' : maxDeviation < 0.05 ? 'text-yellow-600' : 'text-red-600'}">
            {(maxDeviation * 100).toFixed(1)}%
          </span>
        </div>
        <div class="flex justify-between">
          <span>Unassigned pop:</span>
          <span class="font-mono">{districtPops[0].toLocaleString()}</span>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="mt-4 pt-4 border-t border-gray-200 space-y-2">
        <div class="flex gap-2">
          <button
            class="flex-1 px-3 py-1.5 text-xs font-medium rounded border border-gray-300
                   hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            onclick={undo}
            disabled={undoStack.length === 0}
            title="Undo (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            class="flex-1 px-3 py-1.5 text-xs font-medium rounded border border-gray-300
                   hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            onclick={redo}
            disabled={redoStack.length === 0}
            title="Redo (Ctrl+Y)"
          >
            Redo
          </button>
        </div>
        <button
          class="w-full px-3 py-1.5 text-xs font-medium rounded border border-red-300 text-red-600
                 hover:bg-red-50"
          onclick={resetAll}
        >
          Clear All
        </button>
      </div>

      <!-- Map title + save placeholder -->
      <div class="mt-4 pt-4 border-t border-gray-200">
        <label class="block text-xs font-medium text-gray-600 mb-1">Plan Title</label>
        <input
          type="text"
          bind:value={mapTitle}
          class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded
                 focus:outline-none focus:ring-1 focus:ring-mo-navy"
          placeholder="My District Plan"
        />
        <button
          class="w-full mt-2 px-3 py-2 text-sm font-medium rounded bg-mo-navy text-white
                 hover:bg-mo-navy-light transition-colors"
          onclick={() => statusMessage = 'Save feature requires Supabase setup — coming soon!'}
        >
          Save Plan
        </button>
        <p class="text-[10px] text-gray-400 mt-1 text-center">
          Save & share requires Supabase connection
        </p>
      </div>
    </div>
  </div>

  <!-- Map area -->
  <div class="flex-1 relative order-1 md:order-2 min-h-[350px]" bind:this={mapContainer}>
    <!-- Loading overlay -->
    {#if isLoading}
      <div class="absolute inset-0 bg-white/70 flex items-center justify-center z-20">
        <div class="text-center">
          <div class="text-mo-navy font-semibold mb-1">Loading census tracts...</div>
          <div class="text-xs text-gray-500">1,654 tracts across Missouri</div>
        </div>
      </div>
    {/if}

    <!-- Status bar overlay (bottom) -->
    <div class="absolute bottom-2 left-2 right-2 md:left-auto md:right-2 md:w-auto
                bg-white/90 backdrop-blur-sm rounded px-3 py-1.5 text-xs text-gray-600
                shadow-sm z-10">
      {statusMessage}
    </div>

    <!-- Current CD reference legend -->
    <div class="absolute top-2 left-2 bg-white/90 backdrop-blur-sm rounded px-3 py-2
                text-xs text-gray-600 shadow-sm z-10">
      <div class="flex items-center gap-2 mb-1">
        <div class="w-6 h-0 border-t-2 border-dashed border-mo-navy opacity-40"></div>
        <span>Current districts</span>
      </div>
      <div class="text-[10px] text-gray-400">
        {isPainting ? 'Painting...' : 'Click or drag to paint'}
      </div>
    </div>
  </div>
</div>
