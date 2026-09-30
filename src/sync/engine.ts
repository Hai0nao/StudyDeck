import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { dayKey } from "@/lib/time";
import type { Folder } from "@/store/types";
import { useStore } from "@/store/useStore";
import { getClient, syncConfigured } from "./client";
import {
  buildPush,
  chunkPush,
  isEmptyPush,
  toRemoteChanges,
  type CardRow,
  type DayRow,
  type EntityRow,
  type SetData,
  type SettingsRow,
} from "./payload";
import { useSync } from "./syncState";

const PAGE = 1000;
/** Re-read a little before the cursor so rows committed out of order aren't missed. */
const CURSOR_OVERLAP_MS = 10_000;
const AUTO_SYNC_DELAY = 3_000;
const PERIODIC_SYNC = 5 * 60_000;

let running: Promise<void> | null = null;
let again = false;
let applying = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/* ---------- auth ---------- */

export async function signIn(email: string, password: string) {
  const sb = await getClient();
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error?.code === "invalid_credentials") {
    throw new Error("Wrong email or password. New here? Press “Create account” first.");
  }
  if (error?.code === "email_not_confirmed") {
    throw new Error("Confirm your email first — check your inbox for the link from Supabase.");
  }
  if (error) throw new Error(error.message);
}

/** Returns true when the account still needs its email confirmed. */
export async function signUp(email: string, password: string): Promise<boolean> {
  const sb = await getClient();
  const { data, error } = await sb.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  if (error) throw new Error(error.message);
  return !data.session;
}

export async function signOut() {
  const sb = await getClient();
  await sb.auth.signOut();
}

function onSession(session: Session | null) {
  const user = session?.user ?? null;
  const sync = useSync.getState();
  if (!user) {
    useSync.setState({ status: "off", error: null });
    return;
  }
  if (sync.userId !== user.id) {
    // Different account (or first sign-in): start over and upload everything local.
    useSync.setState({ userId: user.id, cursor: null, lastPushAt: 0, lastSyncedAt: null });
    useStore.getState().requestFullPush();
  }
  useSync.setState({ email: user.email ?? null, status: "idle", error: null });
  schedule(0);
}

/* ---------- sync ---------- */

async function pullTable<T>(
  sb: SupabaseClient,
  table: string,
  columns: string,
  since: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from(table)
      .select(columns)
      .gt("synced_at", since)
      .order("synced_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

async function runSync() {
  const sb = await getClient();
  const { data: auth } = await sb.auth.getSession();
  if (!auth.session) {
    useSync.setState({ status: "off" });
    return;
  }
  if (!navigator.onLine) {
    useSync.setState({ status: "offline" });
    return;
  }
  useSync.setState({ status: "syncing", error: null });

  // 1. pull what other devices changed
  const sync = useSync.getState();
  const since = sync.cursor
    ? new Date(Date.parse(sync.cursor) - CURSOR_OVERLAP_MS).toISOString()
    : "1970-01-01T00:00:00Z";
  const entity = "id,data,modified_at,deleted,synced_at";
  const [folders, sets, cards, days, settingsRows] = await Promise.all([
    pullTable<EntityRow<Folder>>(sb, "folders", entity, since),
    pullTable<EntityRow<SetData>>(sb, "sets", entity, since),
    pullTable<CardRow>(sb, "cards", `${entity},set_id`, since),
    pullTable<DayRow>(sb, "day_stats", "device_id,day,answers,correct,new_cards,synced_at", since),
    pullTable<SettingsRow>(sb, "user_settings", "data,modified_at,synced_at", since),
  ]);
  const changes = toRemoteChanges({
    folders,
    sets,
    cards,
    days,
    settings: settingsRows[0] ?? null,
  });
  applying = true;
  try {
    useStore.getState().applyRemote(changes, sync.deviceId);
  } finally {
    applying = false;
  }
  let cursor = sync.cursor;
  for (const r of [...folders, ...sets, ...cards, ...days, ...settingsRows]) {
    if (r.synced_at && (!cursor || Date.parse(r.synced_at) > Date.parse(cursor)))
      cursor = r.synced_at;
  }

  // 2. push local changes
  const pushStart = Date.now();
  const st = useStore.getState();
  const full = st.needsFullPush || sync.lastPushAt === 0;
  const payload = buildPush(
    st,
    sync.deviceId,
    sync.lastPushAt ? dayKey(sync.lastPushAt) : null,
    full,
  );
  if (!isEmptyPush(payload)) {
    for (const chunk of chunkPush(payload)) {
      const { error } = await sb.rpc("push_changes", {
        p_folders: chunk.folders,
        p_sets: chunk.sets,
        p_cards: chunk.cards,
        p_days: chunk.days,
        p_settings: chunk.settings,
      });
      if (error) throw new Error(error.message);
    }
  }
  useStore.getState().markPushed(payload.stamps);
  useSync.setState({
    cursor,
    lastPushAt: pushStart,
    lastSyncedAt: Date.now(),
    status: "idle",
    error: null,
  });
}

/** Pull then push. Concurrent calls are coalesced into one follow-up run. */
export function syncNow(): Promise<void> {
  if (!syncConfigured) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = runSync()
    .catch((e: unknown) => {
      const offline = !navigator.onLine;
      useSync.setState({
        status: offline ? "offline" : "error",
        error: offline ? null : e instanceof Error ? e.message : String(e),
      });
    })
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        schedule(500);
      }
    });
  return running;
}

function schedule(delay = AUTO_SYNC_DELAY) {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

/** Wire up auth + automatic syncing. Safe to call once at startup. */
export async function initSync() {
  if (!syncConfigured) return;
  const sb = await getClient();

  // Supabase warns against awaiting its own calls inside this callback.
  sb.auth.onAuthStateChange((_event, session) => setTimeout(() => onSession(session), 0));
  const { data } = await sb.auth.getSession();
  onSession(data.session);

  // Local edits → upload shortly after.
  useStore.subscribe((st, prev) => {
    if (applying || !useSync.getState().userId || useSync.getState().status === "off") return;
    if (
      st.dirty !== prev.dirty ||
      st.tombstones !== prev.tombstones ||
      st.days !== prev.days ||
      st.needsFullPush !== prev.needsFullPush
    ) {
      schedule();
    }
  });

  window.addEventListener("online", () => schedule(500));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") schedule(500);
  });
  setInterval(() => {
    if (document.visibilityState === "visible") void syncNow();
  }, PERIODIC_SYNC);
}
