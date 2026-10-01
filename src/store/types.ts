/** Serialisable copy of a ts-fsrs Card (dates stored as epoch ms). */
export interface SrsState {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  /** 0 New · 1 Learning · 2 Review · 3 Relearning */
  state: 0 | 1 | 2 | 3;
  last_review: number | null;
}

/** Learn-mode progress: 0 not studied · 1 familiar (got the choice right) · 2 mastered (typed it). */
export type LearnLevel = 0 | 1 | 2;

export interface Card {
  id: string;
  term: string;
  def: string;
  star: boolean;
  learn: LearnLevel;
  srs: SrsState;
  seen: number;
  correct: number;
  wrong: number;
  /** image ids (see lib/images) shown on each side */
  termImage?: string | null;
  defImage?: string | null;
  createdAt: number;
  /** last local or synced change (epoch ms) — decides which copy wins when syncing */
  modifiedAt: number;
}

export interface StudySet {
  id: string;
  title: string;
  description: string;
  folderId: string | null;
  /** BCP-47 tags for text-to-speech; empty = detect from the text. */
  termLang: string;
  defLang: string;
  cards: Card[];
  createdAt: number;
  updatedAt: number;
  studiedAt: number | null;
  matchBest: number | null;
  modifiedAt: number;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  modifiedAt: number;
}

export interface DayStat {
  /** answers given in any mode */
  answers: number;
  correct: number;
  /** cards seen for the first time by the scheduler */
  newCards: number;
}

export type Provider = "claude" | "openai" | "gemini";
export type Accent = "lime" | "violet" | "sky" | "coral" | "amber";

export interface Settings {
  accent: Accent;
  ai: {
    provider: Provider;
    keys: Record<Provider, string>;
    models: Record<Provider, string>;
  };
  srs: {
    /** target probability of recalling a card when it comes due */
    retention: number;
    newPerDay: number;
    maxIntervalDays: number;
  };
  reminder: {
    enabled: boolean;
    /** "HH:MM", local time */
    time: string;
    lastNotified: string | null;
  };
  speech: { autoplay: boolean; rate: number };
  /** accept small typos and article differences in typed answers */
  lenient: boolean;
  learnRoundSize: number;
}

export interface AppData {
  sets: StudySet[];
  folders: Folder[];
  days: Record<string, DayStat>;
}

/** Deleted entity waiting to be pushed, keyed "set:<id>", "card:<id>" or "folder:<id>". */
export interface Tombstone {
  at: number;
  setId?: string;
}

/** Book-keeping for cloud sync, persisted with the rest of the data. */
export interface SyncMeta {
  /** entities changed locally since the last push, keyed like tombstones (+ "settings") */
  dirty: Record<string, number>;
  tombstones: Record<string, Tombstone>;
  /** set when everything must be uploaded (first sign-in, restore, import) */
  needsFullPush: boolean;
  /** daily stats reported by other devices: deviceId → day → stat */
  remoteDays: Record<string, Record<string, DayStat>>;
  settingsModifiedAt: number;
}
