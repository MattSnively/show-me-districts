<!--
  DistrictEditor.svelte — Interactive census tract painting tool for creating
  custom congressional district plans. Users select a district color and
  click/drag tracts to assign them. Real-time population and fairness metrics.

  Built in Phase 3.
-->
<script lang="ts">
  /**
   * Placeholder: MapLibre map with click-to-paint census tract interaction.
   * Will load ~1,400 Missouri census tracts, support 8-district color assignment,
   * track population per district, compute metrics, and save/load via Supabase.
   */
  import { MO_DISTRICT_COUNT, DISTRICT_COLORS } from '../../lib/map-utils';

  /** Currently selected district slot (0-7) */
  let activeDistrict = $state(0);
</script>

<div class="relative w-full h-full">
  <!-- Map canvas + sidebar will be initialized here in Phase 3 -->
  <div class="w-full h-full flex items-center justify-center bg-mo-neutral-100 text-mo-neutral-600">
    <div class="text-center">
      <p class="text-lg font-semibold mb-1">District Editor</p>
      <p class="text-sm">
        {MO_DISTRICT_COUNT} districts, {DISTRICT_COLORS.length} colors — painting tool coming in Phase 3
      </p>
      <p class="text-xs mt-2">Active district: #{activeDistrict + 1}</p>
    </div>
  </div>
</div>
