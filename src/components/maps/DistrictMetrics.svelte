<!--
  DistrictMetrics.svelte — Displays compactness, population, and partisan scores
  for a set of districts. Shared between the Editor (Phase 3) and Fair Maps (Phase 4).
  Calls metric functions from lib/metrics.ts and renders results in a card grid.
-->
<script lang="ts">
  /**
   * Placeholder: Renders a grid of MetricCard-like elements showing
   * Polsby-Popper, Reock, population deviation, efficiency gap, and
   * mean-median difference for the currently displayed district plan.
   */

  /** Pre-computed metrics passed in from parent component */
  interface Props {
    polsbyPopper?: number;
    reock?: number;
    populationDeviation?: number;
    efficiencyGap?: number;
    meanMedian?: number;
  }

  let {
    polsbyPopper = 0,
    reock = 0,
    populationDeviation = 0,
    efficiencyGap = 0,
    meanMedian = 0,
  }: Props = $props();
</script>

<div class="grid grid-cols-2 md:grid-cols-5 gap-3 p-4">
  <div class="p-3 bg-white rounded border border-gray-200 text-center">
    <div class="text-xs text-gray-500 uppercase">Polsby-Popper</div>
    <div class="text-xl font-bold">{polsbyPopper.toFixed(3)}</div>
  </div>
  <div class="p-3 bg-white rounded border border-gray-200 text-center">
    <div class="text-xs text-gray-500 uppercase">Reock</div>
    <div class="text-xl font-bold">{reock.toFixed(3)}</div>
  </div>
  <div class="p-3 bg-white rounded border border-gray-200 text-center">
    <div class="text-xs text-gray-500 uppercase">Pop. Deviation</div>
    <div class="text-xl font-bold">{(populationDeviation * 100).toFixed(1)}%</div>
  </div>
  <div class="p-3 bg-white rounded border border-gray-200 text-center">
    <div class="text-xs text-gray-500 uppercase">Efficiency Gap</div>
    <div class="text-xl font-bold">{(efficiencyGap * 100).toFixed(1)}%</div>
  </div>
  <div class="p-3 bg-white rounded border border-gray-200 text-center">
    <div class="text-xs text-gray-500 uppercase">Mean-Median</div>
    <div class="text-xl font-bold">{(meanMedian * 100).toFixed(1)}%</div>
  </div>
</div>
