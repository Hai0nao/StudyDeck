import {
  ArrowLeft,
  ArrowRight,
  Check,
  PartyPopper,
  RotateCcw,
  Settings2,
  Star,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { CardImage } from "@/components/CardImage";
import { Modal, Switch } from "@/components/ui";
import { useHotkeys, useLocalState } from "@/lib/hooks";
import { shuffle } from "@/lib/random";
import { speak } from "@/lib/speech";
import { useStore } from "@/store/useStore";
import type { StudySet } from "@/store/types";
import { Finish, StudyShell } from "./StudyShell";

interface FcOptions {
  shuffle: boolean;
  starredOnly: boolean;
  front: "term" | "def";
  track: boolean;
}

export function FlashcardsPage() {
  const { id } = useParams();
  const set = useStore((s) => s.sets.find((x) => x.id === id));
  if (!set) return <Navigate to="/library" replace />;
  return <Flashcards set={set} />;
}

function Flashcards({ set }: { set: StudySet }) {
  const { recordAnswer, toggleStar, markStudied } = useStore.getState();
  const speech = useStore((s) => s.settings.speech);
  const [opts, setOpts] = useLocalState<FcOptions>("studydeck.flashcards", {
    shuffle: false,
    starredOnly: false,
    front: "term",
    track: true,
  });
  const [showOpts, setShowOpts] = useState(false);

  const makeDeck = (onlyIds?: string[]) => {
    let cards = set.cards;
    if (onlyIds) cards = cards.filter((c) => onlyIds.includes(c.id));
    else if (opts.starredOnly && cards.some((c) => c.star)) cards = cards.filter((c) => c.star);
    const ids = cards.map((c) => c.id);
    return opts.shuffle ? shuffle(ids) : ids;
  };

  const [deck, setDeck] = useState<string[]>(() => makeDeck());
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<string[]>([]);
  const [learning, setLearning] = useState<string[]>([]);
  const [swipe, setSwipe] = useState<"" | "swipe-left" | "swipe-right">("");
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<number | null>(null);

  const byId = useMemo(() => new Map(set.cards.map((c) => [c.id, c])), [set.cards]);
  const card = byId.get(deck[i]);
  const done = i >= deck.length;

  useEffect(() => {
    markStudied(set.id);
  }, [set.id, markStudied]);

  const frontText = card ? (opts.front === "term" ? card.term : card.def) : "";
  const backText = card ? (opts.front === "term" ? card.def : card.term) : "";
  const frontLang = opts.front === "term" ? set.termLang : set.defLang;
  const backLang = opts.front === "term" ? set.defLang : set.termLang;

  useEffect(() => {
    if (speech.autoplay && card && !flipped) speak(frontText, frontLang, speech.rate);
  }, [card, flipped, frontText, frontLang, speech]);

  const restart = (onlyIds?: string[]) => {
    setDeck(makeDeck(onlyIds));
    setI(0);
    setFlipped(false);
    setKnown([]);
    setLearning([]);
  };

  const flip = () => {
    setFlipped((f) => {
      if (!f && speech.autoplay) speak(backText, backLang, speech.rate);
      return !f;
    });
  };

  const go = (d: number) => {
    setFlipped(false);
    setI((n) => Math.max(0, Math.min(deck.length, n + d)));
  };

  const mark = (knows: boolean) => {
    if (!card || swipe) return;
    recordAnswer(set.id, card.id, knows);
    (knows ? setKnown : setLearning)((l) => [...l, card.id]);
    setSwipe(knows ? "swipe-right" : "swipe-left");
    setTimeout(() => {
      setSwipe("");
      setFlipped(false);
      setI((n) => n + 1);
    }, 220);
  };

  const undo = () => {
    if (i === 0) return;
    const prev = deck[i - 1];
    setKnown((l) => l.filter((x) => x !== prev));
    setLearning((l) => l.filter((x) => x !== prev));
    go(-1);
  };

  useHotkeys(
    (e) => {
      if (done || showOpts) return;
      if (e.key === " " || e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        flip();
      } else if (e.key === "ArrowRight") {
        if (opts.track) mark(true);
        else go(1);
      } else if (e.key === "ArrowLeft") {
        if (opts.track) mark(false);
        else go(-1);
      } else if (e.key.toLowerCase() === "s" && card) toggleStar(set.id, card.id);
      else if (e.key.toLowerCase() === "z" && opts.track) undo();
    },
    [done, showOpts, opts.track, card, i, deck, flipped, swipe],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return;
    dragStart.current = e.clientX;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStart.current !== null) setDrag(e.clientX - dragStart.current);
  };
  const onPointerUp = () => {
    if (dragStart.current === null) return;
    const dx = drag;
    dragStart.current = null;
    setDrag(0);
    if (Math.abs(dx) < 70) return;
    if (opts.track) mark(dx > 0);
    else go(dx > 0 ? -1 : 1);
  };

  const optionsModal = showOpts && (
    <Modal title="Flashcard options" onClose={() => setShowOpts(false)}>
      <div className="opt-list">
        <div className="opt">
          <div>
            <b>Track progress</b>
            <small>Sort cards into “still learning” and “know” (← / →)</small>
          </div>
          <Switch label="Track progress" on={opts.track} onChange={(v) => setOpts({ track: v })} />
        </div>
        <div className="opt">
          <div>
            <b>Shuffle</b>
            <small>Applies when you restart</small>
          </div>
          <Switch label="Shuffle" on={opts.shuffle} onChange={(v) => setOpts({ shuffle: v })} />
        </div>
        <div className="opt">
          <div>
            <b>Starred only</b>
            <small>{set.cards.filter((c) => c.star).length} starred cards</small>
          </div>
          <Switch
            label="Starred only"
            on={opts.starredOnly}
            onChange={(v) => setOpts({ starredOnly: v })}
          />
        </div>
        <div className="opt">
          <div>
            <b>Front of card</b>
          </div>
          <select
            className="select"
            style={{ width: "auto" }}
            value={opts.front}
            onChange={(e) => setOpts({ front: e.target.value as FcOptions["front"] })}
          >
            <option value="term">Term</option>
            <option value="def">Definition</option>
          </select>
        </div>
      </div>
      <button
        className="btn btn-secondary"
        onClick={() => {
          restart();
          setShowOpts(false);
        }}
      >
        <RotateCcw />
        Restart with these options
      </button>
    </Modal>
  );

  const shell = (children: React.ReactNode) => (
    <StudyShell
      title={set.title}
      mode="Flashcards"
      exitTo={`/sets/${set.id}`}
      progress={(Math.min(i, deck.length) / Math.max(1, deck.length)) * 100}
      right={
        <button className="icon-btn" onClick={() => setShowOpts(true)} aria-label="Options">
          <Settings2 />
        </button>
      }
    >
      {children}
      {optionsModal}
    </StudyShell>
  );

  if (done) {
    return shell(
      <Finish
        icon={<PartyPopper />}
        title={
          opts.track
            ? learning.length
              ? "Nice work — keep going"
              : "You know them all!"
            : "End of the deck"
        }
        actions={
          <>
            {opts.track && learning.length > 0 && (
              <button className="btn btn-primary btn-lg" onClick={() => restart(learning)}>
                Keep reviewing {learning.length}
              </button>
            )}
            <button className="btn btn-secondary btn-lg" onClick={() => restart()}>
              <RotateCcw />
              Restart
            </button>
            <Link to={`/sets/${set.id}/learn`} className="btn btn-ghost btn-lg">
              Try Learn mode
            </Link>
          </>
        }
      >
        {opts.track && (
          <div className="finish-stats">
            <div>
              <b className="num" style={{ color: "var(--good)" }}>
                {known.length}
              </b>
              <span>Know</span>
            </div>
            <div>
              <b className="num" style={{ color: "var(--again)" }}>
                {learning.length}
              </b>
              <span>Still learning</span>
            </div>
          </div>
        )}
      </Finish>,
    );
  }

  if (!card) return shell(null);
  const long = (t: string) => t.length > 90;
  const style = drag
    ? { transform: `translateX(${drag}px) rotate(${drag / 30}deg)`, transition: "none" }
    : undefined;

  return shell(
    <>
      {opts.track && (
        <div className="fc-tally num">
          <span className="bad">{learning.length} still learning</span>
          <span className="ok">{known.length} know</span>
        </div>
      )}
      <div className="fc-stage">
        <div
          key={card.id}
          className={`fc${flipped ? " flipped" : ""} ${swipe}`}
          style={style}
          onClick={() => !drag && flip()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {[
            {
              text: frontText,
              lang: frontLang,
              image: opts.front === "term" ? card.termImage : card.defImage,
              cls: "front",
              label: opts.front === "term" ? "Term" : "Definition",
            },
            {
              text: backText,
              lang: backLang,
              image: opts.front === "term" ? card.defImage : card.termImage,
              cls: "back",
              label: opts.front === "term" ? "Definition" : "Term",
            },
          ].map((side) => (
            <div key={side.cls} className={`fc-face ${side.cls}`}>
              <span className="fc-label">{side.label}</span>
              <div className="fc-corner" onClick={(e) => e.stopPropagation()}>
                <button
                  className="icon-btn sm"
                  onClick={() => speak(side.text, side.lang, speech.rate)}
                  aria-label="Play audio"
                >
                  <Volume2 />
                </button>
                <button
                  className={`icon-btn sm${card.star ? " on" : ""}`}
                  onClick={() => toggleStar(set.id, card.id)}
                  aria-label="Star"
                >
                  <Star fill={card.star ? "currentColor" : "none"} />
                </button>
              </div>
              <div className={`fc-content${side.image ? " has-img" : ""}`}>
                <CardImage id={side.image} className="fc-img" />
                {side.text && (
                  <div className={`fc-text${long(side.text) || side.image ? " long" : ""}`}>
                    {side.text}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="fc-controls">
        {opts.track ? (
          <>
            <button
              className="round-btn bad"
              onClick={() => mark(false)}
              aria-label="Still learning"
            >
              <X />
            </button>
            <span className="fc-count num">
              {i + 1} / {deck.length}
            </span>
            <button className="round-btn ok" onClick={() => mark(true)} aria-label="Know">
              <Check />
            </button>
          </>
        ) : (
          <>
            <button
              className="round-btn"
              onClick={() => go(-1)}
              disabled={i === 0}
              aria-label="Previous"
            >
              <ArrowLeft />
            </button>
            <span className="fc-count num">
              {i + 1} / {deck.length}
            </span>
            <button className="round-btn" onClick={() => go(1)} aria-label="Next">
              <ArrowRight />
            </button>
          </>
        )}
      </div>

      <div className="shortcuts">
        <span>
          <span className="kbd">Space</span> flip
        </span>
        <span>
          <span className="kbd">←</span> <span className="kbd">→</span>{" "}
          {opts.track ? "still learning / know" : "navigate"}
        </span>
        <span>
          <span className="kbd">S</span> star
        </span>
        {opts.track && (
          <span>
            <span className="kbd">Z</span> undo
          </span>
        )}
      </div>
    </>,
  );
}
