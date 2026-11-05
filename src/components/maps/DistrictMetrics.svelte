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

  const STATUS_TEXT = {
    good: 'text-green-600',
    warn: 'text-yellow-600',
    bad: 'text-red-600',
  } as const;
  const STATUS_LABEL = { good: 'Good', warn: 'Acceptable', bad: 'Concerning' } as const;

  /**
   * Classifies a metric value against thresholds: good, acceptable ('warn'), or concerning.
   * Status is shown as a dot plus screen-reader text rather than a card border, so it
   * does not rely on color alone.
   */
  function status(value: number, goodThreshold: number, warnThreshold: number, invert = false): keyof typeof STATUS_TEXT {
    const absVal = Math.abs(value);
    if (invert) {
      /* Higher is better (compactness scores) */
      if (absVal >= goodThreshold) return 'good';
      if (absVal >= warnThreshold) return 'warn';
      return 'bad';
    }
    /* Lower is better (deviation, gaps) */
    if (absVal <= goodThreshold) return 'good';
    if (absVal <= warnThreshold) return 'warn';
    return 'bad';
  }
</script>

<div class="grid {compact ? 'grid-cols-2 gap-2' : 'grid-cols-2 md:grid-cols-5 gap-3'} p-3">
  <!-- Polsby-Popper Compactness -->
  <div class="p-3 bg-white rounded border border-gray-200 {STATUS_TEXT[status(polsbyPopper, 0.3, 0.2, true)]}">
    <div class="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-wide">
      <span class="inline-block w-2 h-2 rounded-full bg-current" aria-hidden="true"></span>
      Polsby-Popper
      <span class="sr-only">({STATUS_LABEL[status(polsbyPopper, 0.3, 0.2, true)]})</span>
    </div>
    <div class="text-lg font-bold">{polsbyPopper.toFixed(3)}</div>
    {#if !compact}
      <div class="text-[10px] text-gray-400">Higher = more compact</div>
    {/if}
  </div>

  <!-- Reock Compactness -->
  <div class="p-3 bg-white rounded border border-gray-200 {STATUS_TEXT[status(reock, 0.35, 0.25, true)]}">
    <div class="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-wide">
      <span class="inline-block w-2 h-2 rounded-full bg-current" aria-hidden="true"></span>
      Reock
      <span class="sr-only">({STATUS_LABEL[status(reock, 0.35, 0.25, true)]})</span>
    </div>
    <div class="text-lg font-bold">{reock.toFixed(3)}</div>
    {#if !compact}
      <div class="text-[10px] text-gray-400">Higher = more compact</div>
    {/if}
  </div>

  <!-- Population Deviation -->
  <div class="p-3 bg-white rounded border border-gray-200 {STATUS_TEXT[status(populationDeviation, 0.01, 0.05)]}">
    <div class="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-wide">
      <span class="inline-block w-2 h-2 rounded-full bg-current" aria-hidden="true"></span>
      Pop. Deviation
      <span class="sr-only">({STATUS_LABEL[status(populationDeviation, 0.01, 0.05)]})</span>
    </div>
    <div class="text-lg font-bold">{(populationDeviation * 100).toFixed(1)}%</div>
    {#if !compact}
      <div class="text-[10px] text-gray-400">Lower = more equal</div>
    {/if}
  </div>

  <!-- Efficiency Gap -->
  <div class="p-3 bg-white rounded border border-gray-200 {STATUS_TEXT[status(efficiencyGap, 0.04, 0.08)]}">
    <div class="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-wide">
      <span class="inline-block w-2 h-2 rounded-full bg-current" aria-hidden="true"></span>
      Efficiency Gap
      <span class="sr-only">({STATUS_LABEL[status(efficiencyGap, 0.04, 0.08)]})</span>
    </div>
    <div class="text-lg font-bold">{(efficiencyGap * 100).toFixed(1)}%</div>
    {#if !compact}
      <div class="text-[10px] text-gray-400">Closer to 0 = fairer</div>
    {/if}
  </div>

  <!-- Mean-Median -->
  <div class="p-3 bg-white rounded border border-gray-200 {STATUS_TEXT[status(meanMedian, 0.02, 0.05)]}">
    <div class="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-wide">
      <span class="inline-block w-2 h-2 rounded-full bg-current" aria-hidden="true"></span>
      Mean-Median
      <span class="sr-only">({STATUS_LABEL[status(meanMedian, 0.02, 0.05)]})</span>
    </div>
    <div class="text-lg font-bold">{(meanMedian * 100).toFixed(1)}%</div>
    {#if !compact}
      <div class="text-[10px] text-gray-400">Closer to 0 = fairer</div>
    {/if}
  </div>
</div>
