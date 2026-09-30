import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mergeData, readLegacyLocalStorage } from "@/lib/backup";
import { uid } from "@/lib/id";
import { isDue, isNew, newSrs, Rating, review, type Grade } from "@/lib/srs";
import { dayKey } from "@/lib/time";
import { DEFAULT_SETTINGS, makeCard, makeSet } from "./defaults";
import type { AppData, Card, DayStat, Folder, LearnLevel, Settings, StudySet } from "./types";

export interface CardDraft {
  id?: string;
  term: string;
  def: string;
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
}

export type StoreState = AppData & { settings: Settings } & Actions;

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

export const useStore = create<StoreState>()(
  persist(
    (set, get) => {
      const mapSet = (id: string, fn: (s: StudySet) => StudySet) =>
        set((st) => ({ sets: st.sets.map((s) => (s.id === id ? fn(s) : s)) }));
      const mapCard = (setId: string, cardId: string, fn: (c: Card) => Card) =>
        mapSet(setId, (s) => ({ ...s, cards: s.cards.map((c) => (c.id === cardId ? fn(c) : c)) }));
      const srsOpts = () => get().settings.srs;

      return {
        sets: [],
        folders: [],
        days: {},
        settings: DEFAULT_SETTINGS,

        createSet(data, cards) {
          const s = makeSet({
            ...data,
            cards: cards.map((c) => makeCard(c.term.trim(), c.def.trim())),
          });
          set((st) => ({ sets: [s, ...st.sets] }));
          return s.id;
        },
        updateSet(id, patch) {
          mapSet(id, (s) => ({ ...s, ...patch, updatedAt: Date.now() }));
        },
        saveCards(id, drafts) {
          mapSet(id, (s) => {
            const old = new Map(s.cards.map((c) => [c.id, c]));
            const cards = drafts.map((d) => {
              const prev = d.id ? old.get(d.id) : undefined;
              const term = d.term.trim();
              const def = d.def.trim();
              if (!prev) return makeCard(term, def);
              // Both sides rewritten → effectively a new fact, so its progress starts over.
              const rewritten = prev.term !== term && prev.def !== def;
              return rewritten
                ? { ...prev, term, def, learn: 0 as const, srs: newSrs() }
                : { ...prev, term, def };
            });
            return { ...s, cards, updatedAt: Date.now() };
          });
        },
        appendCards(id, drafts) {
          mapSet(id, (s) => ({
            ...s,
            cards: [...s.cards, ...drafts.map((d) => makeCard(d.term.trim(), d.def.trim()))],
            updatedAt: Date.now(),
          }));
        },
        deleteSet(id) {
          set((st) => ({ sets: st.sets.filter((s) => s.id !== id) }));
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
            cards: src.cards.map((c) => ({ ...makeCard(c.term, c.def), star: c.star })),
          });
          set((st) => ({ sets: [copy, ...st.sets] }));
          return copy.id;
        },
        resetProgress(id) {
          mapSet(id, (s) => ({
            ...s,
            matchBest: null,
            cards: s.cards.map((c) => ({
              ...c,
              learn: 0,
              srs: newSrs(),
              seen: 0,
              correct: 0,
              wrong: 0,
            })),
          }));
        },
        markStudied(id) {
          mapSet(id, (s) => ({ ...s, studiedAt: Date.now() }));
        },

        createFolder(name, parentId) {
          const f: Folder = {
            id: uid(),
            name: name.trim() || "New folder",
            parentId,
            createdAt: Date.now(),
          };
          set((st) => ({ folders: [...st.folders, f] }));
          return f.id;
        },
        renameFolder(id, name) {
          set((st) => ({
            folders: st.folders.map((f) =>
              f.id === id ? { ...f, name: name.trim() || f.name } : f,
            ),
          }));
        },
        moveFolder(id, parentId) {
          // Refuse to move a folder inside itself or one of its children.
          if (parentId && descendants(get().folders, id).has(parentId)) return;
          set((st) => ({ folders: st.folders.map((f) => (f.id === id ? { ...f, parentId } : f)) }));
        },
        deleteFolder(id) {
          // Sets inside are kept and moved up to the deleted folder's parent.
          const st = get();
          const gone = descendants(st.folders, id);
          const parent = st.folders.find((f) => f.id === id)?.parentId ?? null;
          set({
            folders: st.folders.filter((f) => !gone.has(f.id)),
            sets: st.sets.map((s) =>
              s.folderId && gone.has(s.folderId) ? { ...s, folderId: parent } : s,
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
          const only = cardIds ? new Set(cardIds) : null;
          mapSet(setId, (s) => ({
            ...s,
            cards: s.cards.map((c) => (!only || only.has(c.id) ? { ...c, learn: 0 } : c)),
          }));
        },
        setMatchBest(setId, ms) {
          mapSet(setId, (s) => ({
            ...s,
            matchBest: s.matchBest === null ? ms : Math.min(s.matchBest, ms),
          }));
        },

        updateSettings(patch) {
          set((st) => ({ settings: { ...st.settings, ...patch } }));
        },
        replaceAll(data) {
          set({ sets: data.sets, folders: data.folders, days: data.days });
        },
        mergeIn(data) {
          const st = get();
          set(mergeData({ sets: st.sets, folders: st.folders, days: st.days }, data));
        },
      };
    },
    {
      name: "studydeck.v3",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ sets: s.sets, folders: s.folders, days: s.days, settings: s.settings }),
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
        if (persisted) return { ...current, ...p, settings };
        // First launch on an origin that still has StudyDeck 2 data: bring it over.
        const legacy = readLegacyLocalStorage();
        return legacy ? { ...current, ...legacy, settings } : { ...current, settings };
      },
    },
  ),
);

/* ---------- selectors / helpers (pure) ---------- */

export const findSet = (sets: StudySet[], id: string | undefined) =>
  id ? sets.find((s) => s.id === id) : undefined;

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

export function newRemainingToday(st: Pick<StoreState, "days" | "settings">) {
  const used = st.days[dayKey()]?.newCards ?? 0;
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
