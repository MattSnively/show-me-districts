/**
 * supabase.ts — Supabase client initialization.
 * Creates a singleton client for use across API routes and Svelte components.
 * Environment variables are set in Cloudflare Pages dashboard (or .dev.vars locally).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Returns a configured Supabase client.
 * Reads SUPABASE_URL and SUPABASE_ANON_KEY from environment variables.
 * Throws if either is missing — fail fast rather than silently broken.
 */
export function getSupabaseClient(): SupabaseClient {
  const supabaseUrl = import.meta.env.SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables. ' +
      'Set them in .dev.vars (local) or Cloudflare Pages settings (production).'
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}
