<!--
  MapLegend.svelte — Color legend overlay for map components.
  Supports two modes: partisan (red-blue gradient) and district (8-color palette).
  Positioned as an overlay in the bottom-left of the map container.
-->
<script lang="ts">
  import { DISTRICT_COLORS } from '../../lib/map-utils';

  /** Legend display mode */
  interface Props {
    mode?: 'partisan' | 'district';
  }

  let { mode = 'partisan' }: Props = $props();
</script>

<div class="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg
            border border-gray-200 p-3 text-xs shadow-sm z-10">
  {#if mode === 'partisan'}
    <!-- Red-blue partisan gradient legend -->
    <div class="font-semibold mb-2 text-gray-700">Partisan Lean</div>
    <div class="flex items-center gap-1">
      <span class="text-blue-600">D +20</span>
      <div class="h-3 w-32 rounded"
           style="background: linear-gradient(to right, #2563EB, #8B5CF6, #DC2626)">
      </div>
      <span class="text-red-600">R +20</span>
    </div>
  {:else}
    <!-- District color palette legend -->
    <div class="font-semibold mb-2 text-gray-700">Districts</div>
    <div class="grid grid-cols-4 gap-1">
      {#each DISTRICT_COLORS as color, i}
        <div class="flex items-center gap-1">
          <div class="w-3 h-3 rounded-sm" style="background-color: {color}"></div>
          <span>{i + 1}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>
