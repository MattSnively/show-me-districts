<!--
  HistoricalMap.svelte — Interactive map showing Missouri congressional districts
  across history. Listens to the timeline slider to swap GeoJSON layers by congress number.
  Colors districts by partisan lean when election data is available.

  Built in Phase 2.
-->
<script lang="ts">
  /**
   * Placeholder: MapLibre GL JS map with timeline-driven GeoJSON layer swapping.
   * Will initialize map, load era-specific district boundaries, and overlay
   * election results as choropleth colors.
   */

  /** Current congress number, bound to the timeline slider */
  let currentCongress = $state(118);
</script>

<div class="relative w-full h-full">
  <!-- Map canvas will be initialized here by MapLibre in Phase 2 -->
  <div class="w-full h-full flex items-center justify-center bg-mo-neutral-100 text-mo-neutral-600">
    <div class="text-center">
      <p class="text-lg font-semibold mb-1">Historical Map</p>
      <p class="text-sm">Congress #{currentCongress} — interactive map coming in Phase 2</p>
    </div>
  </div>
</div>
