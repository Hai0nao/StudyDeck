import type { SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** Cloud sync is available only when the build has Supabase settings. */
export const syncConfigured = Boolean(url && key);

let client: Promise<SupabaseClient> | null = null;

/** The Supabase SDK is loaded on demand so it stays out of the first paint. */
export function getClient(): Promise<SupabaseClient> {
  if (!syncConfigured) return Promise.reject(new Error("Cloud sync is not configured."));
  client ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(url!, key!, {
      auth: {
        // PKCE puts the code in ?query, which doesn't clash with the #/ hash router.
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "studydeck.auth",
      },
    }),
  );
  return client;
}
