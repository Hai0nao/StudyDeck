import { shuffle } from "@/lib/random";
import type { Card } from "@/store/types";

export type Side = "term" | "def";
export const other = (s: Side): Side => (s === "term" ? "def" : "term");
export const sideText = (c: Card, s: Side) => (s === "term" ? c.term : c.def);

/** Up to 4 options: the right answer plus distractors from the same set. */
export function buildChoices(card: Card, pool: Card[], answerSide: Side, n = 4): string[] {
  const right = sideText(card, answerSide);
  const seen = new Set([right.trim().toLowerCase()]);
  const wrong: string[] = [];
  for (const c of shuffle(pool)) {
    const t = sideText(c, answerSide);
    const k = t.trim().toLowerCase();
    if (c.id === card.id || !k || seen.has(k)) continue;
    seen.add(k);
    wrong.push(t);
    if (wrong.length >= n - 1) break;
  }
  return shuffle([right, ...wrong]);
}
