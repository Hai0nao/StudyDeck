import {
  Bell,
  CalendarPlus,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { confirm } from "@/components/confirm";
import { toast } from "@/components/toast";
import { Modal, Segmented, Switch } from "@/components/ui";
import { KEY_HELP, MODEL_SUGGESTIONS, PROVIDER_LABELS } from "@/lib/ai";
import { downloadFile, makeBackup, parseBackup } from "@/lib/backup";
import {
  notificationsSupported,
  reminderIcs,
  requestNotificationPermission,
  showReminder,
} from "@/lib/reminders";
import { useStore } from "@/store/useStore";
import type { Accent, AppData, Provider, Settings } from "@/store/types";
import { SyncSection } from "./SyncSection";
import "./settings.css";

const ACCENTS: { id: Accent; color: string; label: string }[] = [
  { id: "lime", color: "#c8f25a", label: "Lime" },
  { id: "violet", color: "#a995ff", label: "Violet" },
  { id: "sky", color: "#5ccbff", label: "Sky" },
  { id: "coral", color: "#ff8a70", label: "Coral" },
  { id: "amber", color: "#ffc857", label: "Amber" },
];

function Section({
  id,
  title,
  desc,
  children,
}: {
  id?: string;
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section className="st-section" id={id}>
      <div className="st-head">
        <h2>{title}</h2>
        {desc && <p>{desc}</p>}
      </div>
      <div className="st-body panel">{children}</div>
    </section>
  );
}

function Row({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="st-row">
      <div className="st-row-text">
        <b>{title}</b>
        {desc && <small>{desc}</small>}
      </div>
      <div className="st-row-ctl">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const sets = useStore((s) => s.sets);
  const folders = useStore((s) => s.folders);
  const days = useStore((s) => s.days);
  const { updateSettings, replaceAll, mergeIn } = useStore.getState();
  const [showKey, setShowKey] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    notificationsSupported() ? Notification.permission : "unsupported",
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<AppData | null>(null);
  const location = useLocation();

  useEffect(() => {
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
  }, [location.hash]);

  const provider = settings.ai.provider;
  const setAi = (patch: Partial<Settings["ai"]>) =>
    updateSettings({ ai: { ...settings.ai, ...patch } });
  const setSrs = (patch: Partial<Settings["srs"]>) =>
    updateSettings({ srs: { ...settings.srs, ...patch } });
  const setReminder = (patch: Partial<Settings["reminder"]>) =>
    updateSettings({ reminder: { ...settings.reminder, ...patch } });

  const appUrl = window.location.href.split("#")[0];
  const totalCards = sets.reduce((n, s) => n + s.cards.length, 0);

  const toggleReminder = async (on: boolean) => {
    if (on) {
      const p = await requestNotificationPermission();
      setPermission(p);
      if (p !== "granted") {
        toast("Notifications are blocked — allow them in your browser settings");
        return;
      }
    }
    setReminder({ enabled: on });
  };

  const onImportFile = async (file: File) => {
    try {
      const data = parseBackup(await file.text());
      if (sets.length) {
        setPending(data); // ask whether to merge or replace
        return;
      }
      replaceAll(data);
      toast(`Restored ${data.sets.length} sets`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't read that file");
    }
  };

  const finishImport = (mode: "merge" | "replace") => {
    if (!pending) return;
    if (mode === "merge") mergeIn(pending);
    else replaceAll(pending);
    toast(
      mode === "merge"
        ? `Added ${pending.sets.length} sets`
        : `Replaced with ${pending.sets.length} sets`,
    );
    setPending(null);
  };

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Everything is stored in this browser. Back up regularly.</p>
        </div>
      </div>

      <Section id="sync" title="Cloud sync" desc="Use the same library on your computer and phone.">
        <SyncSection />
      </Section>

      <Section title="Appearance">
        <Row title="Accent colour">
          <div className="swatches">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                className={`swatch${settings.accent === a.id ? " on" : ""}`}
                style={{ background: a.color }}
                onClick={() => updateSettings({ accent: a.id })}
                aria-label={a.label}
                title={a.label}
              />
            ))}
          </div>
        </Row>
      </Section>

      <Section
        title="AI import"
        desc="Generate cards from a word list or any text. Without a key you can still use Claude.ai or ChatGPT by copy & paste."
      >
        <Row title="Provider">
          <Segmented
            value={provider}
            onChange={(v: Provider) => setAi({ provider: v })}
            options={(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => ({
              value: p,
              label: PROVIDER_LABELS[p],
            }))}
          />
        </Row>
        <Row
          title={`${PROVIDER_LABELS[provider]} API key`}
          desc={
            <>
              Stored only in this browser and sent straight to {PROVIDER_LABELS[provider]}.{" "}
              <a href={KEY_HELP[provider]} target="_blank" rel="noreferrer" className="link">
                Get a key <ExternalLink size={11} />
              </a>
            </>
          }
        >
          <div className="key-input">
            <input
              className="input"
              type={showKey ? "text" : "password"}
              value={settings.ai.keys[provider]}
              placeholder="Paste your key"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) =>
                setAi({ keys: { ...settings.ai.keys, [provider]: e.target.value.trim() } })
              }
            />
            <button
              className="icon-btn"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? <EyeOff /> : <Eye />}
            </button>
          </div>
        </Row>
        <Row title="Model">
          <input
            className="input"
            list={`models-${provider}`}
            value={settings.ai.models[provider]}
            onChange={(e) =>
              setAi({ models: { ...settings.ai.models, [provider]: e.target.value } })
            }
          />
          <datalist id={`models-${provider}`}>
            {MODEL_SUGGESTIONS[provider].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Row>
      </Section>

      <Section title="Study" desc="Spaced repetition uses FSRS, the scheduler behind modern Anki.">
        <Row title="New cards per day" desc="How many never-reviewed cards join your daily review.">
          <input
            className="input num small-input"
            type="number"
            min={0}
            max={500}
            value={settings.srs.newPerDay}
            onChange={(e) => setSrs({ newPerDay: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Row>
        <Row
          title="Target retention"
          desc="Higher means more frequent reviews and fewer forgotten cards."
        >
          <select
            className="select"
            value={settings.srs.retention}
            onChange={(e) => setSrs({ retention: Number(e.target.value) })}
          >
            {[0.8, 0.85, 0.9, 0.93, 0.95].map((r) => (
              <option key={r} value={r}>
                {Math.round(r * 100)}%{r === 0.9 ? " (recommended)" : ""}
              </option>
            ))}
          </select>
        </Row>
        <Row title="Longest interval">
          <select
            className="select"
            value={settings.srs.maxIntervalDays}
            onChange={(e) => setSrs({ maxIntervalDays: Number(e.target.value) })}
          >
            {[30, 90, 180, 365, 730, 3650].map((d) => (
              <option key={d} value={d}>
                {d < 365 ? `${d} days` : `${d / 365} year${d > 365 ? "s" : ""}`}
              </option>
            ))}
          </select>
        </Row>
        <Row title="Learn round size">
          <input
            className="input num small-input"
            type="number"
            min={3}
            max={30}
            value={settings.learnRoundSize}
            onChange={(e) =>
              updateSettings({
                learnRoundSize: Math.min(30, Math.max(3, Number(e.target.value) || 7)),
              })
            }
          />
        </Row>
        <Row title="Forgiving answers" desc="Ignore articles and accept small typos when typing.">
          <Switch
            label="Forgiving answers"
            on={settings.lenient}
            onChange={(v) => updateSettings({ lenient: v })}
          />
        </Row>
        <Row
          title="Read cards aloud"
          desc="Speak each card automatically in Flashcards and Review."
        >
          <Switch
            label="Read cards aloud"
            on={settings.speech.autoplay}
            onChange={(v) => updateSettings({ speech: { ...settings.speech, autoplay: v } })}
          />
        </Row>
        <Row title="Speech speed">
          <select
            className="select"
            value={settings.speech.rate}
            onChange={(e) =>
              updateSettings({ speech: { ...settings.speech, rate: Number(e.target.value) } })
            }
          >
            <option value={0.7}>Slow</option>
            <option value={0.95}>Normal</option>
            <option value={1.15}>Fast</option>
          </select>
        </Row>
      </Section>

      <Section
        id="reminders"
        title="Reminders"
        desc="The browser can remind you while StudyDeck is open or installed. For a reminder that always arrives, add a daily event to your calendar."
      >
        <Row
          title="Daily notification"
          desc={
            permission === "unsupported"
              ? "This browser doesn't support notifications."
              : permission === "denied"
                ? "Notifications are blocked for this site."
                : "Shown at the time below if cards are due."
          }
        >
          <Switch
            label="Daily notification"
            on={settings.reminder.enabled && permission === "granted"}
            onChange={toggleReminder}
          />
        </Row>
        <Row title="Reminder time">
          <input
            className="input time-input"
            type="time"
            value={settings.reminder.time}
            onChange={(e) => setReminder({ time: e.target.value || "20:00", lastNotified: null })}
          />
        </Row>
        <div className="st-actions">
          <button
            className="btn btn-secondary btn-sm"
            disabled={permission !== "granted"}
            onClick={() => showReminder(3, appUrl)}
          >
            <Bell />
            Test notification
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() =>
              downloadFile(
                "studydeck-reminder.ics",
                reminderIcs(settings.reminder.time, appUrl),
                "text/calendar",
              )
            }
          >
            <CalendarPlus />
            Add to calendar (.ics)
          </button>
        </div>
      </Section>

      <Section
        id="data"
        title="Data"
        desc={`${sets.length} sets · ${folders.length} folders · ${totalCards} cards`}
      >
        <Row
          title="Back up"
          desc="Download everything — sets, folders, progress and stats — as one JSON file."
        >
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              downloadFile(
                `studydeck-backup-${new Date().toISOString().slice(0, 10)}.json`,
                JSON.stringify(makeBackup({ sets, folders, days })),
              );
              toast("Backup downloaded");
            }}
          >
            <Download />
            Export
          </button>
        </Row>
        <Row
          title="Restore"
          desc="Works with StudyDeck 3 backups and the old StudyDeck 2 “studydeck-backup.json”."
        >
          <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
            <Upload />
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f);
              e.target.value = "";
            }}
          />
        </Row>
        <Row
          title="Delete everything"
          desc="Removes all sets, folders and progress from this browser."
        >
          <button
            className="btn btn-danger btn-sm"
            onClick={async () => {
              if (
                await confirm(
                  "Delete all data?",
                  "This cannot be undone. Export a backup first if you might want it back.",
                  { confirmLabel: "Delete everything" },
                )
              ) {
                replaceAll({ sets: [], folders: [], days: {} });
                toast("All data deleted");
              }
            }}
          >
            <Trash2 />
            Delete
          </button>
        </Row>
      </Section>

      <Section title="Keyboard shortcuts">
        <div className="shortcut-grid">
          {[
            ["Ctrl K", "Search"],
            ["Space", "Flip card / show answer"],
            ["← →", "Previous / next, or still learning / know"],
            ["1 – 4", "Pick a choice or rate a review"],
            ["Enter", "Submit / continue"],
            ["S", "Star the current card"],
            ["Ctrl S", "Save in the editor"],
          ].map(([k, v]) => (
            <div key={k}>
              <span className="kbd">{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </Section>

      <p className="faint st-foot">StudyDeck {__APP_VERSION__}</p>

      {pending && (
        <Modal
          title="Restore backup"
          onClose={() => setPending(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setPending(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={() => finishImport("replace")}>
                Replace everything
              </button>
              <button className="btn btn-primary" onClick={() => finishImport("merge")} autoFocus>
                Add alongside
              </button>
            </>
          }
        >
          <p className="muted">
            The file has {pending.sets.length} sets and {pending.folders.length} folders. Add them
            next to your {sets.length} current sets, or replace everything here with the backup?
          </p>
        </Modal>
      )}
    </div>
  );
}
