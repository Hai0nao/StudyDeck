import { shuffle } from "@/lib/random";
import type { Card } from "@/store/types";

export type Side = "term" | "def";
export const other = (s: Side): Side => (s === "term" ? "def" : "term");
export const sideText = (c: Card, s: Side) => (s === "term" ? c.term : c.def);
export const sideImage = (c: Card, s: Side) => (s === "term" ? c.termImage : c.defImage) ?? null;
/** A side can be asked for or shown when it has text or an image. */
export const hasSide = (c: Card, s: Side) => !!sideText(c, s).trim() || !!sideImage(c, s);
/** Typed answers need text to compare against. */
export const canType = (c: Card, s: Side) => !!sideText(c, s).trim();

/**
 * Up to `n` options as card ids: the right card plus distractors from the same set
 * whose answer side looks different (text and image).
 */
export function buildChoices(card: Card, pool: Card[], answerSide: Side, n = 4): string[] {
  const look = (c: Card) =>
    `${sideText(c, answerSide).trim().toLowerCase()}|${sideImage(c, answerSide) ?? ""}`;
  const seen = new Set([look(card)]);
  const wrong: string[] = [];
  for (const c of shuffle(pool)) {
    const k = look(c);
    if (c.id === card.id || !hasSide(c, answerSide) || seen.has(k)) continue;
    seen.add(k);
    wrong.push(c.id);
    if (wrong.length >= n - 1) break;
  }
  return shuffle([card.id, ...wrong]);
}
