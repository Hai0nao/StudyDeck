import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  type Card as FsrsCard,
  type FSRS,
  type Grade,
} from "ts-fsrs";
import type { Card, SrsState } from "@/store/types";
import { DAY } from "./time";

export { Rating };
export type { Grade };

export interface SchedulerOptions {
  retention: number;
  maxIntervalDays: number;
}

let cached: { key: string; f: FSRS } | null = null;

/** FSRS scheduler for the given options (memoised; options rarely change). */
export function scheduler({ retention, maxIntervalDays }: SchedulerOptions): FSRS {
  const key = `${retention}|${maxIntervalDays}`;
  if (!cached || cached.key !== key) {
    cached = {
      key,
      f: fsrs(
        generatorParameters({
          request_retention: retention,
          maximum_interval: maxIntervalDays,
          enable_fuzz: true,
          enable_short_term: true,
        }),
      ),
    };
  }
  return cached.f;
}

export function toSrs(c: FsrsCard): SrsState {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as SrsState["state"],
    last_review: c.last_review ? c.last_review.getTime() : null,
  };
}

export function fromSrs(s: SrsState): FsrsCard {
  return {
    ...s,
    due: new Date(s.due),
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  };
}

export function newSrs(now: number = Date.now()): SrsState {
  return toSrs(createEmptyCard(new Date(now)));
}

export function review(
  srs: SrsState,
  grade: Grade,
  opts: SchedulerOptions,
  now: number = Date.now(),
): SrsState {
  return toSrs(scheduler(opts).next(fromSrs(srs), new Date(now), grade).card);
}

/** Next due time for each possible grade, for the rating buttons. */
export function previewIntervals(
  srs: SrsState,
  opts: SchedulerOptions,
  now: number = Date.now(),
): Record<Grade, number> {
  const f = scheduler(opts);
  const card = fromSrs(srs);
  const at = new Date(now);
  const out = {} as Record<Grade, number>;
  for (const g of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Grade[]) {
    out[g] = f.next(card, at, g).card.due.getTime() - now;
  }
  return out;
}

export const isNew = (c: Card) => c.srs.state === 0;
export const isDue = (c: Card, now: number = Date.now()) => c.srs.state !== 0 && c.srs.due <= now;

/**
 * Convert a StudyDeck 2 card ({lvl, added, due} on a fixed 1-3-7-14-30-90 day ladder)
 * into an FSRS card that keeps the old due date and a matching stability.
 */
const LEGACY_INTERVALS = [1, 3, 7, 14, 30, 90];
export function fromLegacy(
  legacy: { lvl?: number; added?: number; due?: number } | undefined,
  now: number = Date.now(),
): SrsState {
  const lvl = Math.max(0, Math.min(LEGACY_INTERVALS.length - 1, legacy?.lvl ?? 0));
  if (!legacy || lvl === 0) {
    // Never passed a review: start fresh, but keep it in today's queue if it was due.
    return newSrs(now);
  }
  const interval = LEGACY_INTERVALS[lvl];
  const due = legacy.due ?? now;
  return {
    due,
    stability: interval,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: interval,
    learning_steps: 0,
    reps: lvl,
    lapses: 0,
    state: 2,
    last_review: due - interval * DAY,
  };
}
