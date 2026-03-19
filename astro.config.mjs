// @ts-check
import { defineConfig } from 'astro/config';

import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  /** Replace with actual production URL before launch */
  site: 'https://show-me-districts.pages.dev',

  integrations: [svelte(), sitemap()],

  vite: {
    plugins: [tailwindcss()],
    build: {
      /**
       * MapLibre GL JS (~600KB) and Turf.js (~300KB) are expected large
       * dependencies for a map-heavy application. Raise the threshold
       * to avoid noisy warnings in build output.
       */
      chunkSizeWarningLimit: 1500,
    },
  },

  adapter: cloudflare(),
});