<!--
  FairMapViewer.svelte — Browse and compare pre-computed fair district plans.
  Displays plans on a MapLibre map with side-by-side comparison mode and
  metric scoring tables.

  Built in Phase 4.
-->
<script lang="ts">
  /**
   * Placeholder: MapLibre map with plan browsing, comparison mode,
   * and metric display. Will load curated plans from ensemble-metadata.json,
   * render them on the map, and highlight differences between plans.
   */

  /** Currently selected plan for display */
  let selectedPlan = $state<string | null>(null);

  /** Second plan for comparison mode (null = single view) */
  let comparisonPlan = $state<string | null>(null);
</script>

<div class="relative w-full h-full">
  <!-- Map canvas + plan browser will be initialized here in Phase 4 -->
  <div class="w-full h-full flex items-center justify-center bg-mo-neutral-100 text-mo-neutral-600">
    <div class="text-center">
      <p class="text-lg font-semibold mb-1">Fair Map Viewer</p>
      <p class="text-sm">Plan comparison tool — coming in Phase 4</p>
      {#if selectedPlan}
        <p class="text-xs mt-2">Selected: {selectedPlan}</p>
      {/if}
    </div>
  </div>
</div>
