import type { RemoteChanges, StoreState, SyncedSettings } from "@/store/useStore";
import { pickSyncedSettings } from "@/store/useStore";
import type { Card, DayStat, Folder, StudySet } from "@/store/types";

/* ---------- rows as stored in Supabase ---------- */

export interface EntityRow<T> {
  id: string;
  data: T | null;
  modified_at: number;
  deleted: boolean;
  synced_at?: string;
}
export type SetData = Omit<StudySet, "cards"> & { cardIds: string[] };
export type CardRow = EntityRow<Card> & { set_id: string };
export interface DayRow {
  device_id: string;
  day: string;
  answers: number;
  correct: number;
  new_cards: number;
  synced_at?: string;
}
export interface SettingsRow {
  data: SyncedSettings;
  modified_at: number;
  synced_at?: string;
}

export interface PushPayload {
  folders: EntityRow<Folder>[];
  sets: EntityRow<SetData>[];
  cards: CardRow[];
  days: DayRow[];
  settings: { data: SyncedSettings; modified_at: number } | null;
  /** key → modifiedAt that was uploaded, to clear the matching change markers */
  stamps: Record<string, number>;
}

export const isEmptyPush = (p: PushPayload) =>
  !p.folders.length && !p.sets.length && !p.cards.length && !p.days.length && !p.settings;

const setRow = (s: StudySet): EntityRow<SetData> => {
  const { cards, ...meta } = s;
  return {
    id: s.id,
    data: { ...meta, cardIds: cards.map((c) => c.id) },
    modified_at: s.modifiedAt,
    deleted: false,
  };
};

/**
 * Collect what needs uploading: everything when `full`, otherwise only entities
 * marked dirty since the last push, plus deletions and recent daily stats.
 */
export function buildPush(
  st: Pick<
    StoreState,
    | "sets"
    | "folders"
    | "days"
    | "settings"
    | "dirty"
    | "tombstones"
    | "settingsModifiedAt"
    | "needsFullPush"
  >,
  deviceId: string,
  sinceDay: string | null,
  full: boolean,
): PushPayload {
  const out: PushPayload = {
    folders: [],
    sets: [],
    cards: [],
    days: [],
    settings: null,
    stamps: {},
  };
  const dirty = st.dirty;

  if (full) {
    for (const f of st.folders)
      out.folders.push({ id: f.id, data: f, modified_at: f.modifiedAt, deleted: false });
    for (const s of st.sets) {
      out.sets.push(setRow(s));
      for (const c of s.cards)
        out.cards.push({
          id: c.id,
          set_id: s.id,
          data: c,
          modified_at: c.modifiedAt,
          deleted: false,
        });
    }
    out.settings = { data: pickSyncedSettings(st.settings), modified_at: st.settingsModifiedAt };
    Object.assign(out.stamps, dirty);
  } else {
    const folders = new Map(st.folders.map((f) => [f.id, f]));
    const sets = new Map(st.sets.map((s) => [s.id, s]));
    const cards = new Map<string, { card: Card; setId: string }>();
    for (const s of st.sets) for (const c of s.cards) cards.set(c.id, { card: c, setId: s.id });

    for (const [key, at] of Object.entries(dirty)) {
      const [kind, id] = splitKey(key);
      if (kind === "folder") {
        const f = folders.get(id);
        if (f) out.folders.push({ id, data: f, modified_at: f.modifiedAt, deleted: false });
      } else if (kind === "set") {
        const s = sets.get(id);
        if (s) out.sets.push(setRow(s));
      } else if (kind === "card") {
        const hit = cards.get(id);
        if (hit) {
          out.cards.push({
            id,
            set_id: hit.setId,
            data: hit.card,
            modified_at: hit.card.modifiedAt,
            deleted: false,
          });
        }
      } else if (key === "settings") {
        out.settings = {
          data: pickSyncedSettings(st.settings),
          modified_at: st.settingsModifiedAt,
        };
      }
      out.stamps[key] = at;
    }
  }

  for (const [key, t] of Object.entries(st.tombstones)) {
    const [kind, id] = splitKey(key);
    const row = { id, data: null, modified_at: t.at, deleted: true };
    if (kind === "folder") out.folders.push(row);
    else if (kind === "set") out.sets.push(row);
    else if (kind === "card") out.cards.push({ ...row, set_id: t.setId ?? "" });
    out.stamps[key] = Math.max(out.stamps[key] ?? 0, t.at);
  }

  for (const [day, d] of Object.entries(st.days)) {
    if (!full && sinceDay && day < sinceDay) continue;
    out.days.push(dayRow(deviceId, day, d));
  }
  return out;
}

const dayRow = (deviceId: string, day: string, d: DayStat): DayRow => ({
  device_id: deviceId,
  day,
  answers: d.answers,
  correct: d.correct,
  new_cards: d.newCards,
});

function splitKey(key: string): [string, string] {
  const i = key.indexOf(":");
  return i < 0 ? [key, ""] : [key.slice(0, i), key.slice(i + 1)];
}

/** Split a payload so no single request carries too many cards. */
export function chunkPush(p: PushPayload, size = 400): Omit<PushPayload, "stamps">[] {
  const chunks: Omit<PushPayload, "stamps">[] = [
    {
      folders: p.folders,
      sets: p.sets,
      cards: p.cards.slice(0, size),
      days: p.days,
      settings: p.settings,
    },
  ];
  for (let i = size; i < p.cards.length; i += size) {
    chunks.push({
      folders: [],
      sets: [],
      cards: p.cards.slice(i, i + size),
      days: [],
      settings: null,
    });
  }
  return chunks;
}

/** Decode pulled rows into the shape the store merges. */
export function toRemoteChanges(rows: {
  folders: EntityRow<Folder>[];
  sets: EntityRow<SetData>[];
  cards: CardRow[];
  days: DayRow[];
  settings: SettingsRow | null;
}): RemoteChanges {
  return {
    folders: rows.folders.map((r) => ({
      id: r.id,
      data: r.data,
      modifiedAt: Number(r.modified_at),
      deleted: r.deleted,
    })),
    sets: rows.sets.map((r) => ({
      id: r.id,
      data: r.data,
      modifiedAt: Number(r.modified_at),
      deleted: r.deleted,
    })),
    cards: rows.cards.map((r) => ({
      id: r.id,
      setId: r.set_id,
      data: r.data,
      modifiedAt: Number(r.modified_at),
      deleted: r.deleted,
    })),
    days: rows.days.map((r) => ({
      deviceId: r.device_id,
      day: r.day,
      stat: { answers: r.answers, correct: r.correct, newCards: r.new_cards },
    })),
    settings: rows.settings
      ? { data: rows.settings.data, modifiedAt: Number(rows.settings.modified_at) }
      : null,
  };
}
