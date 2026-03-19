# Show-Me Districts — Claude Instructions

## Project Overview
Missouri congressional redistricting visualization and civic engagement site.
Astro 5 + Svelte 5 islands + Tailwind CSS + MapLibre GL JS + Supabase.

## Key Principles
- **Nonpartisan**: Present data and tools, not conclusions. Both parties gerrymander.
- **Fair framing**: This is a transparency project, not a hit piece on any party.
- **Accessible**: All non-map content must be screen-reader friendly. Map interactions need keyboard alternatives.

## Architecture
- **Astro hybrid mode**: Static pages by default, SSR for `/api/*` routes on Cloudflare Workers.
- **Svelte islands**: Map components use `client:load` for interactivity. Keep islands minimal.
- **Data flow**: GeoJSON files in `data/` are processed by `scripts/` at build time, not shipped raw.
- **Supabase**: User maps stored in `user_maps` table. Anonymous auth for low-friction saves.

## Conventions
- Missouri color theme: navy (`#003B6F`), gold (`#D4A843`), with partisan red/blue for data viz.
- Layout follows hawleywatch pattern: `BaseLayout.astro` wraps all pages with `Navigation` + `Footer`.
- `container-site` class for consistent max-width and padding.
- Comments on every function explaining what and why.

## Data Pipeline
Scripts in `scripts/` are local-only (not deployed). They process raw data into `data/` JSON/GeoJSON files.
- `extract-missouri.js`: Filters MO from UCLA national shapefiles
- `simplify-geometries.js`: Reduces file size via mapshaper
- `join-election-data.js`: Attaches election results to district features
- `prepare-census-tracts.js`: Extracts MO census tracts for the editor

## Testing
- Run `npm run build` to verify all pages compile.
- Validate GeoJSON files in geojson.io before committing.
- Metric functions in `lib/metrics.ts` should have unit tests (TODO).

## Environment Variables
Set in `.dev.vars` (local) or Cloudflare Pages dashboard:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
