export type Grade = "exact" | "close" | "wrong";

export function normalize(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .trim()
    .replace(/[.,;:!?'"“”‘’()[\]]/g, "")
    .replace(/\s+/g, " ");
}

const ARTICLES = /^(a|an|the|to|một|các|những)\s+/;
const stripArticles = (s: string) => normalize(s).replace(ARTICLES, "");

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/**
 * Grade a typed answer. With `lenient`, articles are ignored, any one of several
 * meanings separated by , ; / "or" is accepted, and small typos count as "close".
 */
export function gradeAnswer(input: string, target: string, lenient = true): Grade {
  const a = normalize(input);
  const b = normalize(target);
  if (!a) return "wrong";
  if (a === b) return "exact";
  if (!lenient) return "wrong";

  if (stripArticles(a) === stripArticles(b)) return "exact";
  const parts = target
    .split(/[,;/]|\bor\b|\bhoặc\b/)
    .map(normalize)
    .filter(Boolean);
  if (parts.length > 1 && parts.some((p) => stripArticles(p) === stripArticles(a))) return "exact";

  const tolerance = b.length <= 4 ? 1 : b.length <= 8 ? 2 : 3;
  return levenshtein(a, b) <= tolerance ? "close" : "wrong";
}
