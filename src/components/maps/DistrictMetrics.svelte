<!--
  DistrictMetrics.svelte — Displays compactness, population, and partisan scores
  for a set of districts. Shared between the Editor (Phase 3) and Fair Maps (Phase 4).
  Renders a compact grid of metric cards with color-coded status indicators.

  Props:
    polsbyPopper      — Average Polsby-Popper compactness (0 to 1, higher = more compact)
    reock              — Average Reock compactness (0 to 1)
    populationDeviation — Max percent deviation from ideal (0 = perfect)
    efficiencyGap      — Efficiency gap as decimal (signed, 0 = no advantage)
    meanMedian         — Mean-median vote share difference (signed)
    compact            — If true, render in a more compact layout for sidebar use
-->
<script lang="ts">
  interface Props {
    polsbyPopper?: number;
    reock?: number;
    populationDeviation?: number;
    efficiencyGap?: number;
    meanMedian?: number;
    compact?: boolean;
  }

  let {
    polsbyPopper = 0,
    reock = 0,
    populationDeviation = 0,
    efficiencyGap = 0,
    meanMedian = 0,
    compact = false,
  }: Props = $props();

  /**
   * Returns a status color class based on the metric value and thresholds.
   * Green = good, yellow = acceptable, red = concerning.
   */
  function statusColor(value: number, goodThreshold: number, warnThreshold: number, invert = false): string {
    const absVal = Math.abs(value);
    if (invert) {
      /* Higher is better (compactness scores) */
      if (absVal >= goodThreshold) return 'text-green-600 border-l-green-500';
      if (absVal >= warnThreshold) return 'text-yellow-600 border-l-yellow-500';
      return 'text-red-600 border-l-red-500';
    }
    /* Lower is better (deviation, gaps) */
    if (absVal <= goodThreshold) return 'text-green-600 border-l-green-500';
    if (absVal <= warnThreshold) return 'text-yellow-600 border-l-yellow-500';
    return 'text-red-600 border-l-red-500';
  }
</script>

<div class="grid {compact ? 'grid-cols-2 gap-2' : 'grid-cols-2 md:grid-cols-5 gap-3'} p-3">
  <!-- Polsby-Popper Compactness -->
  <div class="p-3 bg-white rounded border border-gray-200 border-l-4 {statusColor(polsbyPopper, 0.3, 0.2, true)}">
    <div class="text-[10px] text-gray-500 uppercase tracking-wide">Polsby-Popper</div>
    <div class="text-lg font-bold">{polsbyPopper.toFixed(3)}</div>
    {#if !compact}
      <div class="text-[10px] text-gray-400">Higher = more compact</div>
    {/if}
  </div>

  <!-- Reock Compactness -->
  <div class="p-3 bg-white rounded border border-gray-200 border-l-4 {statusColor(reock, 0.35, 0.25, true)}">
    <div class="text-[10px] text-gray-500 uppercase tracking-wide">Reock</div>
    <div class="text-lg font-bold">{reock.toFixed(3)}</div>
    {#if !compact}
      <div class="text-[10px] text-gray-400">Higher = more compact</div>
    {/if}
  </div>

  <!-- Population Deviation -->
  <div class="p-3 bg-white rounded border border-gray-200 border-l-4 {statusColor(populationDeviation, 0.01, 0.05)}">
    <div class="text-[10px] text-gray-500 uppercase tracking-wide">Pop. Deviation</div>
    <div class="text-lg font-bold">{(populationDeviation * 100).toFixed(1)}%</div>
    {#if !compact}
      <div class="text-[10px] text-gray-400">Lower = more equal</div>
    {/if}
  </div>

  <!-- Efficiency Gap -->
  <div class="p-3 bg-white rounded border border-gray-200 border-l-4 {statusColor(efficiencyGap, 0.04, 0.08)}">
    <div class="text-[10px] text-gray-500 uppercase tracking-wide">Efficiency Gap</div>
    <div class="text-lg font-bold">{(efficiencyGap * 100).toFixed(1)}%</div>
    {#if !compact}
      <div class="text-[10px] text-gray-400">Closer to 0 = fairer</div>
    {/if}
  </div>

  <!-- Mean-Median -->
  <div class="p-3 bg-white rounded border border-gray-200 border-l-4 {statusColor(meanMedian, 0.02, 0.05)}">
    <div class="text-[10px] text-gray-500 uppercase tracking-wide">Mean-Median</div>
    <div class="text-lg font-bold">{(meanMedian * 100).toFixed(1)}%</div>
    {#if !compact}
      <div class="text-[10px] text-gray-400">Closer to 0 = fairer</div>
    {/if}
  </div>
</div>
