import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mergeData, normalizeData, readLegacyLocalStorage } from "@/lib/backup";
import { uid } from "@/lib/id";
import { isDue, isNew, newSrs, Rating, review, type Grade } from "@/lib/srs";
import { dayKey } from "@/lib/time";
import { DEFAULT_SETTINGS, makeCard, makeSet } from "./defaults";
import type {
  AppData,
  Card,
  DayStat,
  Folder,
  LearnLevel,
  Settings,
  StudySet,
  SyncMeta,
  Tombstone,
} from "./types";

export interface CardDraft {
  id?: string;
  term: string;
  def: string;
  termImage?: string | null;
  defImage?: string | null;
}

const draftImages = (d: CardDraft) => ({
  termImage: d.termImage ?? null,
  defImage: d.defImage ?? null,
});

/** Settings that follow you across devices. API keys and reminder state stay local. */
export type SyncedSettings = Pick<
  Settings,
  "accent" | "srs" | "speech" | "lenient" | "learnRoundSize"
> & { ai: Pick<Settings["ai"], "provider" | "models"> };

export function pickSyncedSettings(s: Settings): SyncedSettings {
  return {
    accent: s.accent,
    srs: s.srs,
    speech: s.speech,
    lenient: s.lenient,
    learnRoundSize: s.learnRoundSize,
    ai: { provider: s.ai.provider, models: s.ai.models },
  };
}

/** Rows pulled from the server, already decoded. */
export interface RemoteChanges {
  folders: { id: string; data: Folder | null; modifiedAt: number; deleted: boolean }[];
  sets: {
    id: string;
    data: (Omit<StudySet, "cards"> & { cardIds: string[] }) | null;
    modifiedAt: number;
    deleted: boolean;
  }[];
  cards: { id: string; setId: string; data: Card | null; modifiedAt: number; deleted: boolean }[];
  days: { deviceId: string; day: string; stat: DayStat }[];
  settings: { data: SyncedSettings; modifiedAt: number } | null;
}

interface Actions {
  createSet(data: Partial<StudySet>, cards: CardDraft[]): string;
  updateSet(id: string, patch: Partial<Omit<StudySet, "id" | "cards">>): void;
  /** Save the editor: keeps progress of cards whose id survived, creates the rest. */
  saveCards(id: string, drafts: CardDraft[]): void;
  appendCards(id: string, drafts: CardDraft[]): void;
  deleteSet(id: string): void;
  duplicateSet(id: string): string | null;
  resetProgress(id: string): void;
  markStudied(id: string): void;

  createFolder(name: string, parentId: string | null): string;
  renameFolder(id: string, name: string): void;
  moveFolder(id: string, parentId: string | null): void;
  deleteFolder(id: string): void;

  toggleStar(setId: string, cardId: string): void;
  /** Explicit spaced-repetition rating from Review mode. */
  rateCard(setId: string, cardId: string, grade: Grade): void;
  /** Right/wrong from a practice mode (flashcards, learn, test). */
  recordAnswer(setId: string, cardId: string, correct: boolean): void;
  setLearnLevel(setId: string, cardId: string, level: LearnLevel): void;
  resetLearn(setId: string, cardIds?: string[]): void;
  setMatchBest(setId: string, ms: number): void;

  updateSettings(patch: Partial<Settings>): void;
  replaceAll(data: AppData): void;
  mergeIn(data: AppData): void;

  /** Merge rows pulled from the cloud (newest copy wins). */
  applyRemote(changes: RemoteChanges, ownDeviceId: string): void;
  /** Forget local change markers that were uploaded and haven't changed since. */
  markPushed(pushed: Record<string, number>): void;
  requestFullPush(): void;
}

export type StoreState = AppData & { settings: Settings } & SyncMeta & Actions;

function bumpDay(days: Record<string, DayStat>, patch: Partial<DayStat>) {
  const k = dayKey();
  const d = days[k] ?? { answers: 0, correct: 0, newCards: 0 };
  return {
    ...days,
    [k]: {
      answers: d.answers + (patch.answers ?? 0),
      correct: d.correct + (patch.correct ?? 0),
      newCards: d.newCards + (patch.newCards ?? 0),
    },
  };
}

function descendants(folders: Folder[], id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id);
        grew = true;
      }
    }
  }
  return out;
}

const EMPTY_SYNC: SyncMeta = {
  dirty: {},
  tombstones: {},
  needsFullPush: true,
  remoteDays: {},
  settingsModifiedAt: 0,
};

export const useStore = create<StoreState>()(
  persist(
    (set, get) => {
      const srsOpts = () => get().settings.srs;

      /** Record local changes so the next sync uploads them. */
      const dirty = (st: StoreState, keys: string[], at: number) => {
        const d = { ...st.dirty };
        for (const k of keys) d[k] = at;
        return d;
      };
      const bury = (st: StoreState, entries: [string, Tombstone][]) => {
        const t = { ...st.tombstones };
        for (const [k, v] of entries) t[k] = v;
        return t;
      };

      /** Change a set's own fields (title, folder, card order…). */
      const mapSet = (id: string, fn: (s: StudySet) => StudySet) => {
        const now = Date.now();
        set((st) => ({
          sets: st.sets.map((s) => (s.id === id ? { ...fn(s), modifiedAt: now } : s)),
          dirty: dirty(st, [`set:${id}`], now),
        }));
      };
      /** Change some cards of a set without touching the set itself. */
      const mapCards = (setId: string, ids: Set<string> | null, fn: (c: Card) => Card) => {
        const now = Date.now();
        set((st) => {
          const changed: string[] = [];
          const sets = st.sets.map((s) =>
            s.id !== setId
              ? s
              : {
                  ...s,
                  cards: s.cards.map((c) => {
                    if (ids && !ids.has(c.id)) return c;
                    changed.push(`card:${c.id}`);
                    return { ...fn(c), modifiedAt: now };
                  }),
                },
          );
          return { sets, dirty: dirty(st, changed, now) };
        });
      };
      const mapCard = (setId: string, cardId: string, fn: (c: Card) => Card) =>
        mapCards(setId, new Set([cardId]), fn);

      const newSetWithCards = (s: StudySet) =>
        set((st) => ({
          sets: [s, ...st.sets],
          dirty: dirty(st, [`set:${s.id}`, ...s.cards.map((c) => `card:${c.id}`)], s.modifiedAt),
        }));

      return {
        sets: [],
        folders: [],
        days: {},
        settings: DEFAULT_SETTINGS,
        ...EMPTY_SYNC,

        createSet(data, cards) {
          const s = makeSet({
            ...data,
            cards: cards.map((c) =>
              makeCard(c.term.trim(), c.def.trim(), Date.now(), draftImages(c)),
            ),
          });
          newSetWithCards(s);
          return s.id;
        },
        updateSet(id, patch) {
          mapSet(id, (s) => ({ ...s, ...patch, updatedAt: Date.now() }));
        },
        saveCards(id, drafts) {
          const now = Date.now();
          set((st) => {
            const s = st.sets.find((x) => x.id === id);
            if (!s) return {};
            const old = new Map(s.cards.map((c) => [c.id, c]));
            const touched: string[] = [];
            const cards = drafts.map((d) => {
              const prev = d.id ? old.get(d.id) : undefined;
              const term = d.term.trim();
              const def = d.def.trim();
              const images = draftImages(d);
              if (!prev) {
                const c = makeCard(term, def, now, images);
                touched.push(`card:${c.id}`);
                return c;
              }
              const sameImages =
                (prev.termImage ?? null) === images.termImage &&
                (prev.defImage ?? null) === images.defImage;
              if (prev.term === term && prev.def === def && sameImages) return prev;
              touched.push(`card:${prev.id}`);
              // Both sides rewritten → effectively a new fact, so its progress starts over.
              const rewritten = prev.term !== term && prev.def !== def;
              return rewritten
                ? {
                    ...prev,
                    term,
                    def,
                    ...images,
                    learn: 0 as const,
                    srs: newSrs(now),
                    modifiedAt: now,
                  }
                : { ...prev, term, def, ...images, modifiedAt: now };
            });
            const kept = new Set(cards.map((c) => c.id));
            const removed = s.cards.filter((c) => !kept.has(c.id));
            return {
              sets: st.sets.map((x) =>
                x.id === id ? { ...x, cards, updatedAt: now, modifiedAt: now } : x,
              ),
              dirty: dirty(st, [`set:${id}`, ...touched], now),
              tombstones: bury(
                st,
                removed.map((c) => [`card:${c.id}`, { at: now, setId: id }]),
              ),
            };
          });
        },
        appendCards(id, drafts) {
          const now = Date.now();
          const added = drafts.map((d) =>
            makeCard(d.term.trim(), d.def.trim(), now, draftImages(d)),
          );
          set((st) => ({
            sets: st.sets.map((s) =>
              s.id === id
                ? { ...s, cards: [...s.cards, ...added], updatedAt: now, modifiedAt: now }
                : s,
            ),
            dirty: dirty(st, [`set:${id}`, ...added.map((c) => `card:${c.id}`)], now),
          }));
        },
        deleteSet(id) {
          const now = Date.now();
          set((st) => {
            const s = st.sets.find((x) => x.id === id);
            if (!s) return {};
            return {
              sets: st.sets.filter((x) => x.id !== id),
              tombstones: bury(st, [
                [`set:${id}`, { at: now }],
                ...s.cards.map((c): [string, Tombstone] => [
                  `card:${c.id}`,
                  { at: now, setId: id },
                ]),
              ]),
            };
          });
        },
        duplicateSet(id) {
          const src = get().sets.find((s) => s.id === id);
          if (!src) return null;
          const copy = makeSet({
            title: `${src.title} (copy)`,
            description: src.description,
            folderId: src.folderId,
            termLang: src.termLang,
            defLang: src.defLang,
            cards: src.cards.map((c) => ({
              ...makeCard(c.term, c.def, Date.now(), c),
              star: c.star,
            })),
          });
          newSetWithCards(copy);
          return copy.id;
        },
        resetProgress(id) {
          mapSet(id, (s) => ({ ...s, matchBest: null }));
          mapCards(id, null, (c) => ({
            ...c,
            learn: 0,
            srs: newSrs(),
            seen: 0,
            correct: 0,
            wrong: 0,
          }));
        },
        markStudied(id) {
          mapSet(id, (s) => ({ ...s, studiedAt: Date.now() }));
        },

        createFolder(name, parentId) {
          const now = Date.now();
          const f: Folder = {
            id: uid(),
            name: name.trim() || "New folder",
            parentId,
            createdAt: now,
            modifiedAt: now,
          };
          set((st) => ({ folders: [...st.folders, f], dirty: dirty(st, [`folder:${f.id}`], now) }));
          return f.id;
        },
        renameFolder(id, name) {
          const now = Date.now();
          set((st) => ({
            folders: st.folders.map((f) =>
              f.id === id ? { ...f, name: name.trim() || f.name, modifiedAt: now } : f,
            ),
            dirty: dirty(st, [`folder:${id}`], now),
          }));
        },
        moveFolder(id, parentId) {
          // Refuse to move a folder inside itself or one of its children.
          if (parentId && descendants(get().folders, id).has(parentId)) return;
          const now = Date.now();
          set((st) => ({
            folders: st.folders.map((f) => (f.id === id ? { ...f, parentId, modifiedAt: now } : f)),
            dirty: dirty(st, [`folder:${id}`], now),
          }));
        },
        deleteFolder(id) {
          // Sets inside are kept and moved up to the deleted folder's parent.
          const now = Date.now();
          const st = get();
          const gone = descendants(st.folders, id);
          const parent = st.folders.find((f) => f.id === id)?.parentId ?? null;
          const moved = st.sets.filter((s) => s.folderId && gone.has(s.folderId));
          set({
            folders: st.folders.filter((f) => !gone.has(f.id)),
            sets: st.sets.map((s) =>
              s.folderId && gone.has(s.folderId) ? { ...s, folderId: parent, modifiedAt: now } : s,
            ),
            dirty: dirty(
              st,
              moved.map((s) => `set:${s.id}`),
              now,
            ),
            tombstones: bury(
              st,
              [...gone].map((fid) => [`folder:${fid}`, { at: now }]),
            ),
          });
        },

        toggleStar(setId, cardId) {
          mapCard(setId, cardId, (c) => ({ ...c, star: !c.star }));
        },
        rateCard(setId, cardId, grade) {
          const card = get()
            .sets.find((s) => s.id === setId)
            ?.cards.find((c) => c.id === cardId);
          if (!card) return;
          const wasNew = isNew(card);
          const ok = grade !== Rating.Again;
          mapCard(setId, cardId, (c) => ({
            ...c,
            srs: review(c.srs, grade, srsOpts()),
            seen: c.seen + 1,
            correct: c.correct + (ok ? 1 : 0),
            wrong: c.wrong + (ok ? 0 : 1),
            learn: ok ? c.learn : 0,
          }));
          set((st) => ({
            days: bumpDay(st.days, { answers: 1, correct: ok ? 1 : 0, newCards: wasNew ? 1 : 0 }),
          }));
        },
        recordAnswer(setId, cardId, correct) {
          const card = get()
            .sets.find((s) => s.id === setId)
            ?.cards.find((c) => c.id === cardId);
          if (!card) return;
          // Practice only counts toward the schedule when the card is new or due,
          // so cramming a set doesn't push intervals out artificially.
          const schedule = isNew(card) || isDue(card);
          mapCard(setId, cardId, (c) => ({
            ...c,
            srs: schedule ? review(c.srs, correct ? Rating.Good : Rating.Again, srsOpts()) : c.srs,
            seen: c.seen + 1,
            correct: c.correct + (correct ? 1 : 0),
            wrong: c.wrong + (correct ? 0 : 1),
          }));
          set((st) => ({
            days: bumpDay(st.days, {
              answers: 1,
              correct: correct ? 1 : 0,
              newCards: isNew(card) ? 1 : 0,
            }),
          }));
        },
        setLearnLevel(setId, cardId, level) {
          mapCard(setId, cardId, (c) => ({ ...c, learn: level }));
        },
        resetLearn(setId, cardIds) {
          mapCards(setId, cardIds ? new Set(cardIds) : null, (c) => ({ ...c, learn: 0 }));
        },
        setMatchBest(setId, ms) {
          mapSet(setId, (s) => ({
            ...s,
            matchBest: s.matchBest === null ? ms : Math.min(s.matchBest, ms),
          }));
        },

        updateSettings(patch) {
          const now = Date.now();
          set((st) => {
            const settings = { ...st.settings, ...patch };
            // Only mark for upload when something that syncs actually changed.
            const synced =
              JSON.stringify(pickSyncedSettings(settings)) !==
              JSON.stringify(pickSyncedSettings(st.settings));
            return synced
              ? { settings, settingsModifiedAt: now, dirty: dirty(st, ["settings"], now) }
              : { settings };
          });
        },
        replaceAll(data) {
          const now = Date.now();
          set((st) => {
            const next = stamp(normalizeData(data), now);
            // Everything that disappears must also disappear on other devices.
            const keep = new Set([
              ...next.sets.map((s) => `set:${s.id}`),
              ...next.sets.flatMap((s) => s.cards.map((c) => `card:${c.id}`)),
              ...next.folders.map((f) => `folder:${f.id}`),
            ]);
            const gone: [string, Tombstone][] = [
              ...st.sets.map((s): [string, Tombstone] => [`set:${s.id}`, { at: now }]),
              ...st.sets.flatMap((s) =>
                s.cards.map((c): [string, Tombstone] => [`card:${c.id}`, { at: now, setId: s.id }]),
              ),
              ...st.folders.map((f): [string, Tombstone] => [`folder:${f.id}`, { at: now }]),
            ].filter(([k]) => !keep.has(k));
            return {
              ...next,
              tombstones: bury(st, gone),
              needsFullPush: true,
            };
          });
        },
        mergeIn(data) {
          const st = get();
          const merged = mergeData(
            { sets: st.sets, folders: st.folders, days: st.days },
            stamp(normalizeData(data), Date.now()),
          );
          set({ ...merged, needsFullPush: true });
        },

        applyRemote(changes, ownDeviceId) {
          set((st) => {
            const localNewer = (key: string, modifiedAt: number, local?: number) =>
              (local ?? -1) > modifiedAt || (st.tombstones[key]?.at ?? -1) > modifiedAt;

            // folders
            const folders = new Map(st.folders.map((f) => [f.id, f]));
            for (const r of changes.folders) {
              const local = folders.get(r.id);
              if (localNewer(`folder:${r.id}`, r.modifiedAt, local?.modifiedAt)) continue;
              if (local?.modifiedAt === r.modifiedAt && !r.deleted) continue;
              if (r.deleted || !r.data) folders.delete(r.id);
              else folders.set(r.id, { ...r.data, modifiedAt: r.modifiedAt });
            }

            // sets (cards are kept; they arrive as their own rows)
            const sets = new Map(st.sets.map((s) => [s.id, s]));
            const order = new Map<string, string[]>();
            for (const r of changes.sets) {
              const local = sets.get(r.id);
              if (localNewer(`set:${r.id}`, r.modifiedAt, local?.modifiedAt)) continue;
              if (local?.modifiedAt === r.modifiedAt && !r.deleted) continue;
              if (r.deleted || !r.data) {
                sets.delete(r.id);
                continue;
              }
              const { cardIds, ...meta } = r.data;
              sets.set(r.id, { ...meta, cards: local?.cards ?? [], modifiedAt: r.modifiedAt });
              order.set(r.id, cardIds ?? []);
            }

            // cards — work on copied arrays, copied once per touched set
            const where = new Map<string, string>(); // cardId → setId
            for (const s of sets.values()) for (const c of s.cards) where.set(c.id, s.id);
            const working = new Map<string, Card[]>();
            const cardsOf = (setId: string) => {
              let list = working.get(setId);
              if (!list) {
                list = [...(sets.get(setId)?.cards ?? [])];
                working.set(setId, list);
              }
              return list;
            };
            for (const r of changes.cards) {
              const ownerId = where.get(r.id);
              const ownerCards = ownerId ? cardsOf(ownerId) : undefined;
              const idx = ownerCards ? ownerCards.findIndex((c) => c.id === r.id) : -1;
              const local = idx >= 0 ? ownerCards![idx] : undefined;
              if (localNewer(`card:${r.id}`, r.modifiedAt, local?.modifiedAt)) continue;
              if (local?.modifiedAt === r.modifiedAt && !r.deleted) continue;
              const card = r.data ? { ...r.data, id: r.id, modifiedAt: r.modifiedAt } : null;
              if (!r.deleted && card && ownerId === r.setId && idx >= 0) {
                ownerCards![idx] = card; // updated in place, keeps its position
                continue;
              }
              if (ownerCards && idx >= 0) {
                ownerCards.splice(idx, 1);
                where.delete(r.id);
              }
              if (r.deleted || !card || !sets.has(r.setId)) continue; // gone, or its set was deleted
              cardsOf(r.setId).push(card);
              where.set(r.id, r.setId);
            }
            for (const id of new Set([...working.keys(), ...order.keys()])) {
              const s = sets.get(id);
              if (!s) continue;
              let cards = working.get(id) ?? s.cards;
              const ids = order.get(id);
              if (ids?.length) {
                const pos = new Map(ids.map((cid, i) => [cid, i]));
                cards = [...cards].sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
              }
              sets.set(id, { ...s, cards });
            }

            // stats from other devices
            const remoteDays = { ...st.remoteDays };
            for (const d of changes.days) {
              if (d.deviceId === ownDeviceId) continue;
              remoteDays[d.deviceId] = { ...remoteDays[d.deviceId], [d.day]: d.stat };
            }

            // settings
            let settings = st.settings;
            let settingsModifiedAt = st.settingsModifiedAt;
            if (changes.settings && changes.settings.modifiedAt > st.settingsModifiedAt) {
              const r = changes.settings.data;
              settings = {
                ...settings,
                ...r,
                srs: { ...settings.srs, ...r.srs },
                speech: { ...settings.speech, ...r.speech },
                ai: {
                  ...settings.ai,
                  provider: r.ai?.provider ?? settings.ai.provider,
                  models: { ...settings.ai.models, ...r.ai?.models },
                },
              };
              settingsModifiedAt = changes.settings.modifiedAt;
            }

            // keep the local ordering of sets; new ones go first
            const known = new Set(st.sets.map((s) => s.id));
            const orderedSets = [
              ...[...sets.values()].filter((s) => !known.has(s.id)),
              ...st.sets.filter((s) => sets.has(s.id)).map((s) => sets.get(s.id)!),
            ];
            return {
              folders: [...folders.values()],
              sets: orderedSets,
              remoteDays,
              settings,
              settingsModifiedAt,
            };
          });
        },
        markPushed(pushed) {
          set((st) => {
            const d = { ...st.dirty };
            const t = { ...st.tombstones };
            for (const [k, at] of Object.entries(pushed)) {
              if (d[k] !== undefined && d[k] <= at) delete d[k];
              if (t[k] && t[k].at <= at) delete t[k];
            }
            return { dirty: d, tombstones: t, needsFullPush: false };
          });
        },
        requestFullPush() {
          set({ needsFullPush: true });
        },
      };
    },
    {
      name: "studydeck.v3",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // Without this, zustand drops stored data whose version differs. Missing fields
      // (e.g. modifiedAt before v2) are filled in by `merge` below.
      migrate: (persisted) => persisted as StoreState,
      partialize: (s) => ({
        sets: s.sets,
        folders: s.folders,
        days: s.days,
        settings: s.settings,
        dirty: s.dirty,
        tombstones: s.tombstones,
        needsFullPush: s.needsFullPush,
        remoteDays: s.remoteDays,
        settingsModifiedAt: s.settingsModifiedAt,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<StoreState>;
        const settings: Settings = {
          ...DEFAULT_SETTINGS,
          ...p.settings,
          ai: {
            ...DEFAULT_SETTINGS.ai,
            ...p.settings?.ai,
            keys: { ...DEFAULT_SETTINGS.ai.keys, ...p.settings?.ai?.keys },
            models: { ...DEFAULT_SETTINGS.ai.models, ...p.settings?.ai?.models },
          },
          srs: { ...DEFAULT_SETTINGS.srs, ...p.settings?.srs },
          reminder: { ...DEFAULT_SETTINGS.reminder, ...p.settings?.reminder },
          speech: { ...DEFAULT_SETTINGS.speech, ...p.settings?.speech },
        };
        if (persisted) {
          const data = normalizeData({
            sets: p.sets ?? [],
            folders: p.folders ?? [],
            days: p.days ?? {},
          });
          return { ...current, ...EMPTY_SYNC, ...p, ...data, settings };
        }
        // First launch on an origin that still has StudyDeck 2 data: bring it over.
        const legacy = readLegacyLocalStorage();
        return legacy ? { ...current, ...legacy, settings } : { ...current, settings };
      },
    },
  ),
);

/** Mark imported data as changed now so it wins over older copies on other devices. */
function stamp(data: AppData, now: number): AppData {
  return {
    days: data.days,
    folders: data.folders.map((f) => ({ ...f, modifiedAt: now })),
    sets: data.sets.map((s) => ({
      ...s,
      modifiedAt: now,
      cards: s.cards.map((c) => ({ ...c, modifiedAt: now })),
    })),
  };
}

/* ---------- selectors / helpers (pure) ---------- */

export const findSet = (sets: StudySet[], id: string | undefined) =>
  id ? sets.find((s) => s.id === id) : undefined;

/** Every image id some card still uses. */
export function referencedImages(sets: StudySet[]): Set<string> {
  const out = new Set<string>();
  for (const s of sets) {
    for (const c of s.cards) {
      if (c.termImage) out.add(c.termImage);
      if (c.defImage) out.add(c.defImage);
    }
  }
  return out;
}

/** This device's stats plus everything other signed-in devices reported. */
export function combinedDays(
  days: Record<string, DayStat>,
  remoteDays: Record<string, Record<string, DayStat>>,
): Record<string, DayStat> {
  const devices = Object.values(remoteDays);
  if (!devices.length) return days;
  const out: Record<string, DayStat> = { ...days };
  for (const dev of devices) {
    for (const [k, v] of Object.entries(dev)) {
      const d = out[k] ?? { answers: 0, correct: 0, newCards: 0 };
      out[k] = {
        answers: d.answers + v.answers,
        correct: d.correct + v.correct,
        newCards: d.newCards + v.newCards,
      };
    }
  }
  return out;
}

export function setMastery(s: StudySet) {
  let fresh = 0,
    learning = 0,
    known = 0;
  for (const c of s.cards) {
    if (c.srs.state === 2 && c.srs.stability >= 7) known++;
    else if (c.srs.state !== 0 || c.learn > 0) learning++;
    else fresh++;
  }
  return { fresh, learning, known, total: s.cards.length };
}

export function dueCount(s: StudySet, now = Date.now()) {
  return s.cards.filter((c) => isDue(c, now)).length;
}

export function newRemainingToday(
  st: Pick<StoreState, "days" | "settings"> & Partial<Pick<StoreState, "remoteDays">>,
) {
  const days = combinedDays(st.days, st.remoteDays ?? {});
  const used = days[dayKey()]?.newCards ?? 0;
  return Math.max(0, st.settings.srs.newPerDay - used);
}

export interface QueueItem {
  setId: string;
  cardId: string;
}

/** Cards to review now: everything due (oldest first), then new cards up to the daily limit. */
export function buildReviewQueue(
  sets: StudySet[],
  newLimit: number,
  onlySetId?: string,
  now = Date.now(),
): { due: QueueItem[]; fresh: QueueItem[] } {
  const scope = onlySetId ? sets.filter((s) => s.id === onlySetId) : sets;
  const due: (QueueItem & { at: number })[] = [];
  const fresh: QueueItem[] = [];
  for (const s of scope) {
    for (const c of s.cards) {
      if (isDue(c, now)) due.push({ setId: s.id, cardId: c.id, at: c.srs.due });
      else if (isNew(c) && fresh.length < newLimit) fresh.push({ setId: s.id, cardId: c.id });
    }
  }
  due.sort((a, b) => a.at - b.at);
  return { due: due.map(({ setId, cardId }) => ({ setId, cardId })), fresh };
}

export function streak(days: Record<string, DayStat>, now = Date.now()) {
  let n = 0;
  let ts = now;
  if (!days[dayKey(ts)]?.answers) ts -= 86_400_000; // nothing yet today → count up to yesterday
  while (days[dayKey(ts)]?.answers) {
    n++;
    ts -= 86_400_000;
  }
  return n;
}
