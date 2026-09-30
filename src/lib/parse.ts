export interface RawCard {
  term: string;
  def: string;
}

export type TermSeparator = "auto" | "tab" | "comma" | "dash" | "colon" | "custom";
export type CardSeparator = "newline" | "semicolon" | "blank" | "custom";

export interface ParseOptions {
  termSep: TermSeparator;
  cardSep: CardSeparator;
  customTermSep?: string;
  customCardSep?: string;
}

export const DEFAULT_PARSE: ParseOptions = { termSep: "auto", cardSep: "newline" };

const AUTO_SEPARATORS: (string | RegExp)[] = ["\t", " = ", /\s+[-–—]\s+/, ": ", " | ", ","];

function splitOnce(line: string, sep: string | RegExp): [string, string] | null {
  if (typeof sep === "string") {
    const i = line.indexOf(sep);
    return i < 0 ? null : [line.slice(0, i), line.slice(i + sep.length)];
  }
  const m = sep.exec(line);
  return m ? [line.slice(0, m.index), line.slice(m.index + m[0].length)] : null;
}

function termSeparator(o: ParseOptions): string | RegExp | null {
  switch (o.termSep) {
    case "tab":
      return "\t";
    case "comma":
      return ",";
    case "dash":
      return /\s*[-–—]\s*/;
    case "colon":
      return ":";
    case "custom":
      return o.customTermSep || null;
    default:
      return null;
  }
}

function splitCards(text: string, o: ParseOptions): string[] {
  switch (o.cardSep) {
    case "semicolon":
      return text.split(";");
    case "blank":
      return text.split(/\n\s*\n/);
    case "custom":
      return o.customCardSep ? text.split(o.customCardSep) : [text];
    default:
      return text.split(/\r?\n/);
  }
}

/** Parse pasted "term<sep>definition" text (Quizlet export, spreadsheets, notes). */
export function parseCards(text: string, o: ParseOptions = DEFAULT_PARSE): RawCard[] {
  const fixed = termSeparator(o);
  const out: RawCard[] = [];
  for (const chunk of splitCards(text, o)) {
    const line = chunk.trim();
    if (!line) continue;
    let parts: [string, string] | null = null;
    if (fixed) parts = splitOnce(line, fixed);
    else
      for (const sep of AUTO_SEPARATORS) {
        parts = splitOnce(line, sep);
        if (parts) break;
      }
    const [term, def] = parts ?? [line, ""];
    const t = term.trim();
    const d = def.trim().replace(/\s*\n\s*/g, " ");
    if (t || d) out.push({ term: t, def: d });
  }
  return out;
}

interface JsonCard {
  term?: unknown;
  definition?: unknown;
  def?: unknown;
  front?: unknown;
  back?: unknown;
}

function cardsFromJson(value: unknown): { title?: string; cards: RawCard[] } | null {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { cards?: unknown }).cards)
      ? (value as { cards: unknown[] }).cards
      : null;
  if (!list) return null;
  const cards = list
    .filter((c): c is JsonCard => !!c && typeof c === "object")
    .map((c) => ({
      term: String(c.term ?? c.front ?? "").trim(),
      def: String(c.definition ?? c.def ?? c.back ?? "").trim(),
    }))
    .filter((c) => c.term || c.def);
  const title =
    !Array.isArray(value) && typeof (value as { title?: unknown }).title === "string"
      ? (value as { title: string }).title.trim() || undefined
      : undefined;
  return { title, cards };
}

/**
 * Read a reply pasted from Claude / ChatGPT. Accepts the JSON the prompt asks for
 * (optionally inside a ```json fence or surrounded by chatter), a bare JSON array,
 * or falls back to line-by-line "term - definition" text.
 */
export function parseAiReply(text: string): { title?: string; cards: RawCard[] } {
  const trimmed = text.trim();
  const candidates: string[] = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fence) candidates.push(fence[1]);
  candidates.push(trimmed);
  const obj = /\{[\s\S]*\}/.exec(trimmed);
  if (obj) candidates.push(obj[0]);
  const arr = /\[[\s\S]*\]/.exec(trimmed);
  if (arr) candidates.push(arr[0]);

  for (const c of candidates) {
    try {
      const parsed = cardsFromJson(JSON.parse(c));
      if (parsed && parsed.cards.length) return parsed;
    } catch {
      /* try the next candidate */
    }
  }
  const body = fence ? fence[1] : trimmed;
  return {
    cards: parseCards(
      body
        .split(/\r?\n/)
        .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ""))
        .join("\n"),
    ).filter((c) => c.term && c.def),
  };
}
