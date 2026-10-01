import { Grid2x2, RotateCcw, Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { CardImage } from "@/components/CardImage";
import { formatDuration } from "@/lib/time";
import { sample, shuffle } from "@/lib/random";
import { useStore } from "@/store/useStore";
import type { StudySet } from "@/store/types";
import { hasSide } from "./quiz";
import { Finish, StudyShell } from "./StudyShell";

const PAIRS = 6;
const PENALTY = 1000;
const clock = () => performance.now();

interface Tile {
  key: string;
  cardId: string;
  text: string;
  image: string | null;
}

export function MatchPage() {
  const { id } = useParams();
  const set = useStore((s) => s.sets.find((x) => x.id === id));
  if (!set) return <Navigate to="/library" replace />;
  return <Match set={set} />;
}

function deal(set: StudySet): Tile[] {
  const cards = sample(
    set.cards.filter((c) => hasSide(c, "term") && hasSide(c, "def")),
    PAIRS,
  );
  return shuffle(
    cards.flatMap((c) => [
      { key: `${c.id}-t`, cardId: c.id, text: c.term, image: c.termImage ?? null },
      { key: `${c.id}-d`, cardId: c.id, text: c.def, image: c.defImage ?? null },
    ]),
  );
}

function Match({ set }: { set: StudySet }) {
  const { setMatchBest, markStudied } = useStore.getState();
  const [phase, setPhase] = useState<"ready" | "play" | "done">("ready");
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState<string[]>([]);
  const [penalty, setPenalty] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{ ms: number; record: boolean } | null>(null);
  const started = useRef(0);

  useEffect(() => {
    if (phase !== "play") return;
    const t = setInterval(() => setElapsed(clock() - started.current), 100);
    return () => clearInterval(t);
  }, [phase]);

  const start = () => {
    setTiles(deal(set));
    setSelected(null);
    setMatched(new Set());
    setWrong([]);
    setPenalty(0);
    setElapsed(0);
    started.current = clock();
    setPhase("play");
    markStudied(set.id);
  };

  const tap = (tile: Tile) => {
    if (matched.has(tile.key) || wrong.length) return;
    if (!selected) return setSelected(tile.key);
    if (selected === tile.key) return setSelected(null);
    const first = tiles.find((t) => t.key === selected)!;
    if (first.cardId === tile.cardId) {
      const next = new Set(matched).add(first.key).add(tile.key);
      setMatched(next);
      setSelected(null);
      if (next.size === tiles.length) {
        const ms = clock() - started.current + penalty;
        const record = set.matchBest === null || ms < set.matchBest;
        setMatchBest(set.id, ms);
        setResult({ ms, record });
        setPhase("done");
      }
    } else {
      setWrong([first.key, tile.key]);
      setPenalty((p) => p + PENALTY);
      setTimeout(() => {
        setWrong([]);
        setSelected(null);
      }, 380);
    }
  };

  const timer = <span className="timer num">{formatDuration(elapsed + penalty)}</span>;

  return (
    <StudyShell
      title={set.title}
      mode="Match"
      exitTo={`/sets/${set.id}`}
      progress={tiles.length ? (matched.size / tiles.length) * 100 : undefined}
      right={phase === "play" ? timer : undefined}
    >
      {phase === "ready" && (
        <div className="match-start">
          <div className="finish-icon">
            <Grid2x2 />
          </div>
          <h2>Ready to play?</h2>
          <p className="muted">
            Match each term with its definition as fast as you can. Wrong pairs add 1 second.
          </p>
          {set.matchBest !== null && (
            <p className="faint num">Your best: {formatDuration(set.matchBest)}</p>
          )}
          <button
            className="btn btn-primary btn-lg"
            onClick={start}
            autoFocus
            style={{ marginTop: 10 }}
          >
            Start game
          </button>
        </div>
      )}

      {phase === "play" && (
        <div className="match-grid">
          {tiles.map((t) => (
            <button
              key={t.key}
              className={`tile${selected === t.key ? " sel" : ""}${wrong.includes(t.key) ? " bad" : ""}${matched.has(t.key) ? " done" : ""}`}
              onClick={() => tap(t)}
            >
              <CardImage id={t.image} className="tile-img" />
              {t.text && <span>{t.text}</span>}
            </button>
          ))}
        </div>
      )}

      {phase === "done" && result && (
        <Finish
          icon={<Trophy />}
          title={result.record ? "New record!" : "Nice matching"}
          actions={
            <>
              <button className="btn btn-primary btn-lg" onClick={start} autoFocus>
                <RotateCcw />
                Play again
              </button>
              <Link to={`/sets/${set.id}`} className="btn btn-secondary btn-lg">
                Back to set
              </Link>
            </>
          }
        >
          <div className="finish-stats">
            <div>
              <b className="num">{formatDuration(result.ms)}</b>
              <span>Your time</span>
            </div>
            <div>
              <b className="num">
                {formatDuration(Math.min(result.ms, set.matchBest ?? result.ms))}
              </b>
              <span>Best</span>
            </div>
          </div>
        </Finish>
      )}
    </StudyShell>
  );
}
