/**
 * GET /api/list-maps — Returns a paginated list of public user-created maps.
 * Supports query params: page (default 1), limit (default 20), sort (default 'created_at').
 * Used by the community gallery on the editor page.
 *
 * Server-side rendered (SSR) route — runs on Cloudflare Workers.
 */

import type { APIRoute } from 'astro';
import { getSupabaseClient } from '../../lib/supabase';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
  const sort = url.searchParams.get('sort') || 'created_at';
  const offset = (page - 1) * limit;

  /* Whitelist allowed sort columns to prevent injection */
  const allowedSorts = ['created_at', 'updated_at', 'title'];
  const safeSort = allowedSorts.includes(sort) ? sort : 'created_at';

  try {
    const supabase = getSupabaseClient();

    /* Query public maps only, exclude soft-deleted, with pagination */
    const { data, error, count } = await supabase
      .from('user_maps')
      .select('id, created_at, updated_at, author_name, title, description, metrics, is_public', { count: 'exact' })
      .eq('is_public', true)
      .is('deleted_at', null)
      .order(safeSort, { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        maps: data || [],
        page,
        limit,
        total: count || 0,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
