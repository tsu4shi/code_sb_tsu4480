/**
 * Supabase connection settings.
 *
 * Parcel inlines process.env.* at build time from .env (local) or GitHub
 * Actions secrets (Pages deploy). When both are empty the app falls back
 * to localStorage-only mode with no cloud sync.
 */

export const SUPABASE_URL = process.env.SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

/** True when a Supabase project has been configured for this build. */
export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
