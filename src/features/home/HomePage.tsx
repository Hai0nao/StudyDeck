import { ArrowRight, Flame, Layers, Plus, RotateCcw, Sparkles, Upload } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { useReviewCounts } from "@/store/useReviewCounts";
import { SetCard } from "@/components/SetCard";
import { useNow } from "@/lib/hooks";
import { DAY, dayKey, startOfDay } from "@/lib/time";
import { streak, useStore } from "@/store/useStore";
import { openAi } from "@/store/ui";
import "./home.css";

function greeting(now: number) {
  const h = new Date(now).getHours();
  return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function HomePage() {
  const sets = useStore((s) => s.sets);
  const folders = useStore((s) => s.folders);
  const days = useStore((s) => s.days);
  const now = useNow();
  const counts = useReviewCounts();
  const today = days[dayKey(now)] ?? { answers: 0, correct: 0, newCards: 0 };
  const accuracy = today.answers ? Math.round((today.correct / today.answers) * 100) : null;
  const currentStreak = streak(days, now);

  const forecast = useMemo(() => {
    const base = startOfDay(now);
    const buckets = Array.from({ length: 7 }, (_, i) => ({ ts: base + i * DAY, n: 0 }));
    for (const s of sets)
      for (const c of s.cards) {
        if (c.srs.state === 0) continue;
        const i = Math.max(0, Math.floor((c.srs.due - base) / DAY));
        if (i < 7) buckets[i].n++;
      }
    return buckets;
  }, [sets, now]);
  const maxForecast = Math.max(1, ...forecast.map((b) => b.n));

  const heat = useMemo(() => {
    // Columns are weeks (Sunday first), the last column is the current week.
    const weeks = 52;
    const today = new Date(startOfDay(now));
    const d = new Date(today);
    d.setDate(d.getDate() - d.getDay() - (weeks - 1) * 7);
    const cells: { k: string; n: number; future: boolean }[] = [];
    for (let i = 0; i < weeks * 7; i++) {
      const k = dayKey(d.getTime());
      cells.push({ k, n: days[k]?.answers ?? 0, future: d > today });
      d.setDate(d.getDate() + 1);
    }
    return cells;
  }, [days, now]);

  const recent = useMemo(
    () =>
      [...sets]
        .sort((a, b) => (b.studiedAt ?? b.updatedAt) - (a.studiedAt ?? a.updatedAt))
        .slice(0, 6),
    [sets],
  );
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  if (!sets.length) {
    return (
      <div className="page narrow">
        <div className="welcome">
          <span className="welcome-mark">
            <Layers />
          </span>
          <h1>Welcome to StudyDeck</h1>
          <p>
            Make flashcard sets, study them like on Quizlet, and let spaced repetition tell you when
            to review so nothing slips away.
          </p>
          <div className="welcome-actions">
            <Link to="/sets/new" className="btn btn-primary btn-lg">
              <Plus />
              Create a set
            </Link>
            <button className="btn btn-secondary btn-lg" onClick={() => openAi(null)}>
              <Sparkles />
              Import with AI
            </button>
            <Link to="/settings#data" className="btn btn-ghost btn-lg">
              <Upload />
              Restore a backup
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{greeting(now)}</h1>
          <p>
            {new Date(now).toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>
      </div>

      <section className="today">
        <div className="today-main panel">
          <p className="label">Due for review</p>
          <div className="today-count num">{counts.total}</div>
          <p className="muted today-sub">
            {counts.total === 0
              ? "All caught up. New cards will show up here when it's time."
              : `${counts.due} to review${counts.fresh ? ` · ${counts.fresh} new` : ""}`}
          </p>
          <Link
            to="/review"
            className={`btn btn-lg ${counts.total ? "btn-primary" : "btn-secondary"}`}
          >
            <RotateCcw />
            {counts.total ? "Start review" : "Open review"}
          </Link>
        </div>

        <div className="today-side">
          <div className="stat panel">
            <Flame className={currentStreak ? "flame on" : "flame"} />
            <div>
              <b className="num">{currentStreak}</b>
              <span>day streak</span>
            </div>
          </div>
          <div className="stat panel">
            <div>
              <b className="num">{today.answers}</b>
              <span>answers today{accuracy !== null ? ` · ${accuracy}% right` : ""}</span>
            </div>
          </div>
          <div className="forecast panel">
            <p className="label">Next 7 days</p>
            <div className="bars">
              {forecast.map((b, i) => (
                <div key={b.ts} className="bar" title={`${b.n} cards`}>
                  <span className="num">{b.n || ""}</span>
                  <i
                    style={{ height: `${(b.n / maxForecast) * 100}%` }}
                    className={i === 0 ? "now" : ""}
                  />
                  <small>
                    {i === 0
                      ? "Today"
                      : new Date(b.ts).toLocaleDateString(undefined, { weekday: "narrow" })}
                  </small>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="section-title">
        <h2>Activity</h2>
      </div>
      <div className="heat panel panel-pad">
        <div className="heat-scroll">
          <div className="heat-grid">
            {heat.map((c) => (
              <i
                key={c.k}
                title={c.future ? "" : `${c.k}: ${c.n} answers`}
                className={
                  c.future
                    ? "future"
                    : c.n === 0
                      ? ""
                      : c.n < 20
                        ? "l1"
                        : c.n < 60
                          ? "l2"
                          : c.n < 120
                            ? "l3"
                            : "l4"
                }
              />
            ))}
          </div>
        </div>
        <div className="heat-foot">
          <span className="num">
            {heat.reduce((n, c) => n + c.n, 0).toLocaleString()} answers in the past year
          </span>
          <span className="heat-scale">
            Less <i />
            <i className="l1" />
            <i className="l2" />
            <i className="l3" />
            <i className="l4" /> More
          </span>
        </div>
      </div>

      <div className="section-title">
        <h2>Jump back in</h2>
        <Link to="/library">
          Library <ArrowRight size={13} style={{ verticalAlign: -2 }} />
        </Link>
      </div>
      <div className="grid-sets">
        {recent.map((s) => (
          <SetCard
            key={s.id}
            set={s}
            folder={s.folderId ? folderById.get(s.folderId) : undefined}
            now={now}
          />
        ))}
      </div>
    </div>
  );
}
