export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Local calendar day, e.g. "2026-09-30". */
export function dayKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function startOfDay(ts: number = Date.now()): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Compact interval label: "1m", "10m", "3h", "4d", "2mo", "1.2y". */
export function shortInterval(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))}m`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}h`;
  const days = ms / DAY;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

export function relativeDue(due: number, now: number = Date.now()): string {
  const diff = due - now;
  if (diff <= 0) return "due now";
  return `in ${shortInterval(diff)}`;
}

export function formatDuration(ms: number): string {
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

export function timeAgo(ts: number, now: number = Date.now()): string {
  const diff = now - ts;
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.round(diff / MINUTE)} min ago`;
  if (dayKey(ts) === dayKey(now)) return "today";
  if (dayKey(ts) === dayKey(now - DAY)) return "yesterday";
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / DAY);
  if (days < 30) return `${days} days ago`;
  return new Date(ts).toLocaleDateString();
}
