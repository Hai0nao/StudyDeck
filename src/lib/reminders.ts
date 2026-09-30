import { dayKey } from "./time";

export const notificationsSupported = () =>
  typeof window !== "undefined" && "Notification" in window;

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

/** Has today's reminder time passed and no reminder been shown yet today? */
export function reminderIsDue(
  time: string,
  lastNotified: string | null,
  now = new Date(),
): boolean {
  const [h, m] = time.split(":").map(Number);
  const at = new Date(now);
  at.setHours(h || 0, m || 0, 0, 0);
  return now >= at && lastNotified !== dayKey(now.getTime());
}

export async function showReminder(dueCount: number, url: string) {
  const title = "Time to review";
  const body =
    dueCount === 1 ? "1 card is waiting for you." : `${dueCount} cards are waiting for you.`;
  const options: NotificationOptions = {
    body,
    icon: "pwa-192.png",
    badge: "pwa-192.png",
    tag: "studydeck-daily",
    data: { url },
  };
  // Service-worker notifications also work on Android and in installed apps.
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  if (reg) await reg.showNotification(title, options);
  else new Notification(title, options);
}

/** Show the number of due cards on the installed app's icon, where supported. */
export function setAppBadge(count: number) {
  const nav = navigator as Navigator & {
    setAppBadge?: (n: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (count > 0) nav.setAppBadge?.(count).catch(() => {});
  else nav.clearAppBadge?.().catch(() => {});
}

/**
 * A daily recurring calendar event (.ics). Calendar apps deliver the reminder
 * reliably even when the browser is closed — something a static site can't do alone.
 */
export function reminderIcs(time: string, appUrl: string, now = new Date()): string {
  const [h, m] = time.split(":").map(Number);
  const start = new Date(now);
  start.setHours(h || 0, m || 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const end = new Date(start.getTime() + 15 * 60_000);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//StudyDeck//Daily review//EN",
    "BEGIN:VEVENT",
    `UID:studydeck-daily-review-${stamp}@studydeck`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${local(start)}`,
    `DTEND:${local(end)}`,
    "RRULE:FREQ=DAILY",
    "SUMMARY:StudyDeck — daily review",
    `DESCRIPTION:Review your due flashcards: ${appUrl}`,
    `URL:${appUrl}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Time to review your flashcards",
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
