/**
 * GET /api/load-map?id=UUID — Fetches a single user-created district map from Supabase.
 * Returns the full map record including GeoJSON and pre-computed metrics.
 *
 * Server-side rendered (SSR) route — runs on Cloudflare Workers.
 */

import type { APIRoute } from 'astro';
import { getSupabaseClient } from '../../lib/supabase';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const mapId = url.searchParams.get('id');

  if (!mapId) {
    return new Response(
      JSON.stringify({ error: 'Missing required query parameter: id' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabase = getSupabaseClient();

    /* Fetch the map; exclude soft-deleted records */
    const { data, error } = await supabase
      .from('user_maps')
      .select('*')
      .eq('id', mapId)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      return new Response(
        JSON.stringify({ error: 'Map not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(data),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
