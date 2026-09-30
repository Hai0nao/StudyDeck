import { DEFAULT_MODELS } from "@/lib/ai";
import { uid } from "@/lib/id";
import { newSrs } from "@/lib/srs";
import type { Card, Settings, StudySet } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  accent: "lime",
  ai: {
    provider: "claude",
    keys: { claude: "", openai: "", gemini: "" },
    models: { ...DEFAULT_MODELS },
  },
  srs: { retention: 0.9, newPerDay: 20, maxIntervalDays: 365 },
  reminder: { enabled: false, time: "20:00", lastNotified: null },
  speech: { autoplay: false, rate: 0.95 },
  lenient: true,
  learnRoundSize: 7,
};

export function makeCard(term = "", def = "", now = Date.now()): Card {
  return {
    id: uid(),
    term,
    def,
    star: false,
    learn: 0,
    srs: newSrs(now),
    seen: 0,
    correct: 0,
    wrong: 0,
    createdAt: now,
    modifiedAt: now,
  };
}

export function makeSet(partial: Partial<StudySet> = {}): StudySet {
  const now = Date.now();
  return {
    id: uid(),
    title: "",
    description: "",
    folderId: null,
    termLang: "",
    defLang: "",
    cards: [],
    createdAt: now,
    updatedAt: now,
    studiedAt: null,
    matchBest: null,
    modifiedAt: now,
    ...partial,
  };
}
