import { useMemo } from "react";
import { useNow } from "@/lib/hooks";
import { buildReviewQueue, newRemainingToday, useStore } from "./useStore";

/** Cards waiting in the review queue right now (due + today's new cards). */
export function useReviewCounts() {
  const sets = useStore((s) => s.sets);
  const days = useStore((s) => s.days);
  const settings = useStore((s) => s.settings);
  const now = useNow();
  return useMemo(() => {
    const q = buildReviewQueue(sets, newRemainingToday({ days, settings }), undefined, now);
    return { due: q.due.length, fresh: q.fresh.length, total: q.due.length + q.fresh.length };
  }, [sets, days, settings, now]);
}
