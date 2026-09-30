import { CalendarCheck, Coffee, Eye, Volume2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Segmented } from "@/components/ui";
import { useLocalState } from "@/lib/hooks";
import { previewIntervals, Rating, type Grade } from "@/lib/srs";
import { speak } from "@/lib/speech";
import { relativeDue, shortInterval } from "@/lib/time";
import {
  buildReviewQueue,
  findSet,
  newRemainingToday,
  useStore,
  type QueueItem,
} from "@/store/useStore";
import { Finish, StudyShell } from "./StudyShell";

const RATINGS: { grade: Grade; label: string; cls: string; key: string }[] = [
  { grade: Rating.Again, label: "Again", cls: "again", key: "1" },
  { grade: Rating.Hard, label: "Hard", cls: "hard", key: "2" },
  { grade: Rating.Good, label: "Good", cls: "good", key: "3" },
  { grade: Rating.Easy, label: "Easy", cls: "easy", key: "4" },
];

// Cards failed in this session come back if they're due again within this window.
const REQUEUE_WINDOW = 30 * 60_000;

export function ReviewPage() {
  const [params] = useSearchParams();
  const onlySet = params.get("set") ?? undefined;
  const sets = useStore((s) => s.sets);
  const settings = useStore((s) => s.settings);
  const { rateCard } = useStore.getState();
  const [prefs, setPrefs] = useLocalState<{ front: "term" | "def" }>("studydeck.review", {
    front: "term",
  });

  // Snapshot the queue when the session starts.
  const [queue, setQueue] = useState<QueueItem[]>(() => {
    const st = useStore.getState();
    const q = buildReviewQueue(st.sets, newRemainingToday(st), onlySet);
    return [...q.due, ...q.fresh];
  });
  const [pos, setPos] = useState(0);
  const [shown, setShown] = useState(false);
  const [tally, setTally] = useState({ reviewed: 0, again: 0 });

  const item = queue[pos];
  const set = item ? findSet(sets, item.setId) : undefined;
  const card = set?.cards.find((c) => c.id === item?.cardId);
  const scoped = onlySet ? findSet(sets, onlySet) : undefined;

  const intervals = useMemo(
    () => (card ? previewIntervals(card.srs, settings.srs) : null),
    [card, settings.srs],
  );

  const front = card ? (prefs.front === "term" ? card.term : card.def) : "";
  const back = card ? (prefs.front === "term" ? card.def : card.term) : "";
  const frontLang = set ? (prefs.front === "term" ? set.termLang : set.defLang) : "";
  const backLang = set ? (prefs.front === "term" ? set.defLang : set.termLang) : "";

  useEffect(() => {
    if (card && settings.speech.autoplay && !shown) speak(front, frontLang, settings.speech.rate);
  }, [card, shown, front, frontLang, settings.speech]);

  const rate = (grade: Grade) => {
    if (!card || !set) return;
    rateCard(set.id, card.id, grade);
    const updated = useStore
      .getState()
      .sets.find((s) => s.id === set.id)
      ?.cards.find((c) => c.id === card.id);
    if (updated && updated.srs.due - Date.now() < REQUEUE_WINDOW) {
      setQueue([...queue, { setId: set.id, cardId: card.id }]);
    }
    setTally((t) => ({
      reviewed: t.reviewed + 1,
      again: t.again + (grade === Rating.Again ? 1 : 0),
    }));
    setShown(false);
    setPos((p) => p + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (!card) return;
      if (!shown && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setShown(true);
        if (settings.speech.autoplay) speak(back, backLang, settings.speech.rate);
        return;
      }
      if (shown) {
        const r = RATINGS.find((x) => x.key === e.key);
        if (r) rate(r.grade);
        else if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          rate(Rating.Good);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const exitTo = onlySet ? `/sets/${onlySet}` : "/";
  const title = scoped ? scoped.title : "All sets";
  const remaining = Math.max(0, queue.length - pos);

  if (!queue.length || !card) {
    const st = useStore.getState();
    const more = buildReviewQueue(st.sets, newRemainingToday(st), onlySet);
    const moreCount = more.due.length + more.fresh.length;
    const nextDue = Math.min(
      ...(scoped ? [scoped] : sets).flatMap((s) =>
        s.cards.filter((c) => c.srs.state !== 0).map((c) => c.srs.due),
      ),
    );
    return (
      <StudyShell title={title} mode="Review" exitTo={exitTo}>
        <Finish
          icon={tally.reviewed ? <CalendarCheck /> : <Coffee />}
          title={tally.reviewed ? "Session complete" : "Nothing to review"}
          actions={
            <>
              {moreCount > 0 && (
                <button
                  className="btn btn-primary btn-lg"
                  onClick={() => {
                    setQueue([...more.due, ...more.fresh]);
                    setPos(0);
                  }}
                >
                  Review {moreCount} more
                </button>
              )}
              <Link
                to={exitTo}
                className={`btn btn-lg ${moreCount ? "btn-secondary" : "btn-primary"}`}
              >
                Done
              </Link>
              {!tally.reviewed && !moreCount && (
                <Link to="/library" className="btn btn-secondary btn-lg">
                  Study a set
                </Link>
              )}
            </>
          }
        >
          {tally.reviewed > 0 && (
            <div className="finish-stats">
              <div>
                <b className="num">{tally.reviewed}</b>
                <span>Reviews</span>
              </div>
              <div>
                <b className="num">
                  {Math.round(((tally.reviewed - tally.again) / tally.reviewed) * 100)}%
                </b>
                <span>Remembered</span>
              </div>
            </div>
          )}
          <p>
            {moreCount > 0
              ? `${moreCount} more ${moreCount === 1 ? "card has" : "cards have"} come due since you started.`
              : Number.isFinite(nextDue)
                ? `Next card is ${relativeDue(nextDue)}.`
                : "Start a set in Learn or Review to build your schedule."}
          </p>
        </Finish>
      </StudyShell>
    );
  }

  const isNewCard = card.srs.state === 0;
  return (
    <StudyShell
      title={title}
      mode="Review"
      exitTo={exitTo}
      progress={(pos / queue.length) * 100}
      right={
        <Segmented
          value={prefs.front}
          onChange={(v) => setPrefs({ front: v })}
          options={[
            { value: "term", label: "Term first" },
            { value: "def", label: "Def first" },
          ]}
        />
      }
    >
      <div className="hud num">
        <span>
          <b>{remaining}</b> left
        </span>
        <span>{isNewCard ? <span className="badge accent">New</span> : set?.title}</span>
      </div>

      <div className="rv-card">
        <div className="rv-side">
          <div className={`fc-text${front.length > 90 ? " long" : ""}`}>{front}</div>
          <button
            className="icon-btn sm"
            onClick={() => speak(front, frontLang, settings.speech.rate)}
            aria-label="Play audio"
          >
            <Volume2 />
          </button>
        </div>
        {shown && (
          <div className="rv-side">
            <div className={`fc-text${back.length > 90 ? " long" : ""}`}>{back}</div>
            <button
              className="icon-btn sm"
              onClick={() => speak(back, backLang, settings.speech.rate)}
              aria-label="Play audio"
            >
              <Volume2 />
            </button>
          </div>
        )}
      </div>

      {shown && intervals ? (
        <div className="rate">
          {RATINGS.map((r) => (
            <button key={r.grade} className={r.cls} onClick={() => rate(r.grade)}>
              {r.label}
              <small className="num">{shortInterval(intervals[r.grade])}</small>
            </button>
          ))}
        </div>
      ) : (
        <button
          className="btn btn-primary btn-lg btn-block reveal-btn"
          onClick={() => setShown(true)}
        >
          <Eye />
          Show answer
        </button>
      )}

      <div className="shortcuts">
        <span>
          <span className="kbd">Space</span> {shown ? "good" : "show answer"}
        </span>
        <span>
          <span className="kbd">1</span>–<span className="kbd">4</span> again · hard · good · easy
        </span>
      </div>
    </StudyShell>
  );
}
