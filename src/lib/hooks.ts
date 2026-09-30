import { useEffect, useState } from "react";

/** Current time, refreshed every `ms` so due counts stay fresh on an open tab. */
export function useNow(ms = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    const onFocus = () => setNow(Date.now());
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [ms]);
  return now;
}

/** useState persisted to localStorage — for small per-mode preferences. */
export function useLocalState<T extends object>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? { ...initial, ...JSON.parse(raw) } : initial;
    } catch {
      return initial;
    }
  });
  const update = (patch: Partial<T>) =>
    setValue((v) => {
      const next = { ...v, ...patch };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* storage full or blocked — keep in memory */
      }
      return next;
    });
  return [value, update] as const;
}

/** Global keyboard shortcuts that ignore typing in inputs. */
export function useHotkeys(handler: (e: KeyboardEvent) => void, deps: unknown[]) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      handler(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
