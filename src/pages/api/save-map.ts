/**
 * POST /api/save-map — Upserts a user-created district map to Supabase.
 * Accepts a JSON body with title, description, geojson, metrics, and is_public flag.
 * Returns the saved map's UUID for permalink generation.
 *
 * Server-side rendered (SSR) route — runs on Cloudflare Workers.
 */

import type { APIRoute } from 'astro';
import { getSupabaseClient } from '../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();

    /* Validate required fields */
    if (!body.geojson || !body.author_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: geojson, author_id' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = getSupabaseClient();

    /* Upsert: if body.id is provided, update existing map; otherwise insert new */
    const mapData = {
      ...(body.id ? { id: body.id } : {}),
      author_id: body.author_id,
      author_name: body.author_name || 'Anonymous',
      title: body.title || 'Untitled Plan',
      description: body.description || null,
      geojson: body.geojson,
      metrics: body.metrics || {},
      is_public: body.is_public ?? false,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('user_maps')
      .upsert(mapData)
      .select('id')
      .single();

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ id: data.id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
