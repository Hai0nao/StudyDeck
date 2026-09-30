import { useMemo } from "react";
import { useNow } from "@/lib/hooks";
import { buildReviewQueue, combinedDays, newRemainingToday, useStore } from "./useStore";

/** Cards waiting in the review queue right now (due + today's new cards). */
export function useReviewCounts() {
  const sets = useStore((s) => s.sets);
  const days = useStore((s) => s.days);
  const remoteDays = useStore((s) => s.remoteDays);
  const settings = useStore((s) => s.settings);
  const now = useNow();
  return useMemo(() => {
    const newLimit = newRemainingToday({ days, remoteDays, settings });
    const q = buildReviewQueue(sets, newLimit, undefined, now);
    return { due: q.due.length, fresh: q.fresh.length, total: q.due.length + q.fresh.length };
  }, [sets, days, remoteDays, settings, now]);
}

/** Daily stats from this device plus every other signed-in device. */
export function useAllDays() {
  const days = useStore((s) => s.days);
  const remoteDays = useStore((s) => s.remoteDays);
  return useMemo(() => combinedDays(days, remoteDays), [days, remoteDays]);
}
