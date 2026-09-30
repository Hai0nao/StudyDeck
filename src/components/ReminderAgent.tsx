import { useEffect } from "react";
import { useNow } from "@/lib/hooks";
import { reminderIsDue, setAppBadge, showReminder } from "@/lib/reminders";
import { dayKey } from "@/lib/time";
import { useStore } from "@/store/useStore";
import { useReviewCounts } from "@/store/useReviewCounts";

/** Background helper: app-icon badge + the daily notification while the app is open. */
export function ReminderAgent() {
  const { total } = useReviewCounts();
  const reminder = useStore((s) => s.settings.reminder);
  const now = useNow();

  useEffect(() => {
    setAppBadge(total);
  }, [total]);

  useEffect(() => {
    if (!reminder.enabled || total === 0) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (!reminderIsDue(reminder.time, reminder.lastNotified, new Date(now))) return;
    const st = useStore.getState();
    st.updateSettings({ reminder: { ...st.settings.reminder, lastNotified: dayKey(now) } });
    showReminder(total, `${window.location.href.split("#")[0]}#/review`).catch(() => {});
  }, [now, total, reminder]);

  return null;
}
