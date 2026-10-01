import { Check, GraduationCap, RotateCcw, Settings2, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { Modal, Switch } from "@/components/ui";
import type { Grade } from "@/lib/grading";
import { useLocalState } from "@/lib/hooks";
import { shuffle } from "@/lib/random";
import { speak } from "@/lib/speech";
import { useStore } from "@/store/useStore";
import type { Card, LearnLevel, StudySet } from "@/store/types";
import { CardImage } from "@/components/CardImage";
import { MultipleChoice, SideView, WrittenAnswer } from "./questions";
import { buildChoices, canType, hasSide, other, sideImage, sideText, type Side } from "./quiz";
import { Finish, StudyShell } from "./StudyShell";

interface LearnOptions {
  answerWith: Side | "both";
  mc: boolean;
  written: boolean;
  starredOnly: boolean;
}

interface Question {
  cardId: string;
  kind: "mc" | "written";
  prompt: Side;
  choices: string[];
}

interface Outcome {
  correct: boolean;
  grade?: Grade;
  typed?: string;
  picked?: string;
}

interface Round {
  queue: string[];
  pos: number;
  retried: string[];
  log: { id: string; ok: boolean }[];
  phase: "question" | "summary";
  question: Question | null;
}

const DEFAULT_OPTIONS: LearnOptions = {
  answerWith: "def",
  mc: true,
  written: true,
  starredOnly: false,
};

function poolOf(set: StudySet, opts: LearnOptions) {
  const starred = set.cards.filter((c) => c.star);
  return opts.starredOnly && starred.length ? starred : set.cards;
}

function makeQuestion(card: Card, set: StudySet, opts: LearnOptions, poolSize: number): Question {
  let prompt: Side =
    opts.answerWith === "both" ? (Math.random() < 0.5 ? "term" : "def") : other(opts.answerWith);
  // A side with neither text nor image can't be asked; flip the question instead.
  if (!hasSide(card, prompt)) prompt = other(prompt);
  // New cards start as multiple choice, familiar ones are typed.
  let kind: Question["kind"] =
    opts.mc && opts.written
      ? card.learn === 0
        ? "mc"
        : "written"
      : opts.written
        ? "written"
        : "mc";
  if (poolSize < 2) kind = "written";
  // An image-only answer can't be typed.
  if (!canType(card, other(prompt))) kind = "mc";
  return {
    cardId: card.id,
    kind,
    prompt,
    choices: kind === "mc" ? buildChoices(card, set.cards, other(prompt)) : [],
  };
}

function newRound(set: StudySet, opts: LearnOptions, size: number): Round {
  const pool = poolOf(set, opts);
  const remaining = pool.filter((c) => c.learn < 2);
  // finish cards that are halfway first, then bring in new ones
  const picked = [
    ...shuffle(remaining.filter((c) => c.learn === 1)),
    ...shuffle(remaining.filter((c) => c.learn === 0)),
  ].slice(0, size);
  return {
    queue: picked.map((c) => c.id),
    pos: 0,
    retried: [],
    log: [],
    phase: "question",
    question: picked[0] ? makeQuestion(picked[0], set, opts, pool.length) : null,
  };
}

const freshSet = (id: string) => useStore.getState().sets.find((s) => s.id === id);

export function LearnPage() {
  const { id } = useParams();
  const set = useStore((s) => s.sets.find((x) => x.id === id));
  const [opts, setOpts] = useLocalState<LearnOptions>("studydeck.learn", DEFAULT_OPTIONS);
  if (!set) return <Navigate to="/library" replace />;
  // Changing options starts a fresh session.
  return <Learn key={JSON.stringify(opts)} set={set} opts={opts} setOpts={setOpts} />;
}

function Learn({
  set,
  opts,
  setOpts,
}: {
  set: StudySet;
  opts: LearnOptions;
  setOpts: (p: Partial<LearnOptions>) => void;
}) {
  const { recordAnswer, setLearnLevel, resetLearn, markStudied } = useStore.getState();
  const settings = useStore((s) => s.settings);
  const [showOpts, setShowOpts] = useState(false);
  const [round, setRound] = useState<Round>(() => newRound(set, opts, settings.learnRoundSize));
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const pool = useMemo(() => poolOf(set, opts), [set, opts]);
  const byId = useMemo(() => new Map(set.cards.map((c) => [c.id, c])), [set.cards]);
  const mastered = pool.filter((c) => c.learn >= 2).length;

  useEffect(() => {
    markStudied(set.id);
  }, [set.id, markStudied]);

  const { question } = round;
  const card = question ? byId.get(question.cardId) : undefined;
  const answerSide = question ? other(question.prompt) : "def";
  const answer = card ? sideText(card, answerSide) : "";

  const startRound = useCallback(() => {
    const s = freshSet(set.id);
    if (s) setRound(newRound(s, opts, settings.learnRoundSize));
    setOutcome(null);
  }, [set.id, opts, settings.learnRoundSize]);

  const commitAndNext = useCallback(
    (correct: boolean) => {
      if (!card || !question) return;
      recordAnswer(set.id, card.id, correct);
      // Typing masters a card; choosing only makes it familiar unless typing isn't possible.
      const typeable = opts.written && canType(card, other(question.prompt));
      const level: LearnLevel = correct
        ? question.kind === "written"
          ? 2
          : typeable
            ? 1
            : (Math.min(2, card.learn + 1) as LearnLevel)
        : 0;
      setLearnLevel(set.id, card.id, level);

      const s = freshSet(set.id);
      setOutcome(null);
      setRound((r) => {
        // missed cards come back once at the end of the round
        const retry = !correct && !r.retried.includes(card.id);
        const queue = retry ? [...r.queue, card.id] : r.queue;
        const log = r.log.some((l) => l.id === card.id)
          ? r.log
          : [...r.log, { id: card.id, ok: correct }];
        const pos = r.pos + 1;
        const nextCard = s?.cards.find((c) => c.id === queue[pos]);
        return {
          queue,
          pos,
          log,
          retried: retry ? [...r.retried, card.id] : r.retried,
          phase: pos >= queue.length ? "summary" : "question",
          question: nextCard && s ? makeQuestion(nextCard, s, opts, pool.length) : null,
        };
      });
    },
    [card, question, recordAnswer, set.id, opts, setLearnLevel, pool.length],
  );

  // correct answers move on by themselves
  useEffect(() => {
    if (!outcome?.correct || outcome.grade === "close") return;
    const t = setTimeout(() => commitAndNext(true), 750);
    return () => clearTimeout(t);
  }, [outcome, commitAndNext]);

  // Enter / Space continues after feedback
  useEffect(() => {
    if (!outcome) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || (e.key === " " && (e.target as HTMLElement).tagName !== "INPUT")) {
        e.preventDefault();
        commitAndNext(outcome.correct);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [outcome, commitAndNext]);

  const resetAndRestart = () => {
    resetLearn(
      set.id,
      pool.map((c) => c.id),
    );
    startRound();
  };

  const optionsModal = showOpts && (
    <Modal title="Learn options" onClose={() => setShowOpts(false)}>
      <div className="opt-list">
        <div className="opt">
          <div>
            <b>Answer with</b>
            <small>What you pick or type</small>
          </div>
          <select
            className="select"
            style={{ width: "auto" }}
            value={opts.answerWith}
            onChange={(e) => setOpts({ answerWith: e.target.value as LearnOptions["answerWith"] })}
          >
            <option value="def">Definition</option>
            <option value="term">Term</option>
            <option value="both">Both</option>
          </select>
        </div>
        <div className="opt">
          <div>
            <b>Multiple choice</b>
            <small>First step for new cards</small>
          </div>
          <Switch
            label="Multiple choice"
            on={opts.mc}
            onChange={(v) => setOpts(v || opts.written ? { mc: v } : { mc: false, written: true })}
          />
        </div>
        <div className="opt">
          <div>
            <b>Written</b>
            <small>Type the answer to master a card</small>
          </div>
          <Switch
            label="Written"
            on={opts.written}
            onChange={(v) => setOpts(v || opts.mc ? { written: v } : { written: false, mc: true })}
          />
        </div>
        <div className="opt">
          <div>
            <b>Starred only</b>
          </div>
          <Switch
            label="Starred only"
            on={opts.starredOnly}
            onChange={(v) => setOpts({ starredOnly: v })}
          />
        </div>
      </div>
      <button
        className="btn btn-danger"
        onClick={() => {
          setShowOpts(false);
          resetAndRestart();
        }}
      >
        <RotateCcw />
        Reset Learn progress
      </button>
    </Modal>
  );

  const shell = (children: React.ReactNode) => (
    <StudyShell
      title={set.title}
      mode="Learn"
      exitTo={`/sets/${set.id}`}
      progress={(mastered / Math.max(1, pool.length)) * 100}
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

  if (round.phase === "summary") {
    const familiar = pool.filter((c) => c.learn === 1).length;
    return shell(
      <div className="round-sum">
        <div>
          <p className="label">Round complete</p>
          <h2 className="num">
            {mastered} of {pool.length} mastered
          </h2>
        </div>
        <div className="lvl-legend num">
          <span>
            <i style={{ background: "var(--good)" }} />
            Mastered {mastered}
          </span>
          <span>
            <i style={{ background: "var(--hard)" }} />
            Familiar {familiar}
          </span>
          <span>
            <i style={{ background: "var(--surface-3)" }} />
            Not studied {pool.length - mastered - familiar}
          </span>
        </div>
        <ul className="round-list">
          {round.log.map((l) => {
            const c = byId.get(l.id);
            if (!c) return null;
            return (
              <li key={l.id} className={l.ok ? "ok" : "bad"}>
                {l.ok ? <Check /> : <X />}
                <b>{c.term}</b>
                <span>{c.def}</span>
              </li>
            );
          })}
        </ul>
        <div>
          <button className="btn btn-primary btn-lg" onClick={startRound} autoFocus>
            {mastered === pool.length ? "Finish" : "Continue"}
          </button>
        </div>
      </div>,
    );
  }

  if (!card || !question) {
    return shell(
      <Finish
        icon={<GraduationCap />}
        title="You've learned everything"
        actions={
          <>
            <Link to={`/sets/${set.id}/test`} className="btn btn-primary btn-lg">
              Take a test
            </Link>
            <button className="btn btn-secondary btn-lg" onClick={resetAndRestart}>
              <RotateCcw />
              Learn again
            </button>
          </>
        }
      >
        <p>
          All {pool.length} cards are mastered. They're in your spaced review schedule now, so
          you'll be reminded before you forget them.
        </p>
      </Finish>,
    );
  }

  const promptText = sideText(card, question.prompt);
  const promptLang = question.prompt === "term" ? set.termLang : set.defLang;

  return shell(
    <div className="q-card" key={`${card.id}-${round.pos}`}>
      <div className="q-top">
        <span>{question.prompt === "term" ? "Term" : "Definition"}</span>
        <span className="num">
          {round.pos + 1} / {round.queue.length}
        </span>
      </div>
      <div className="q-prompt-wrap">
        <div className={`q-prompt${promptText.length > 90 ? " long" : ""}`}>
          {promptText}
          <CardImage id={sideImage(card, question.prompt)} className="q-img" zoomable />
        </div>
        {promptText && (
          <button
            className="icon-btn sm"
            onClick={() => speak(promptText, promptLang, settings.speech.rate)}
            aria-label="Play audio"
            style={{ marginTop: 4 }}
          >
            <Volume2 />
          </button>
        )}
      </div>

      <p className="q-ask">
        {question.kind === "mc"
          ? `Choose the matching ${answerSide === "def" ? "definition" : "term"}`
          : `Type the ${answerSide === "def" ? "definition" : "term"}`}
      </p>

      {question.kind === "mc" ? (
        <MultipleChoice
          choices={question.choices}
          cards={byId}
          side={answerSide}
          answerId={card.id}
          picked={outcome?.picked ?? null}
          onPick={(p) => setOutcome({ correct: p === card.id, picked: p })}
        />
      ) : (
        <WrittenAnswer
          answer={answer}
          lenient={settings.lenient}
          disabled={!!outcome}
          onGraded={(grade, typed) => setOutcome({ correct: grade !== "wrong", grade, typed })}
        />
      )}

      {!outcome && question.kind === "written" && (
        <div className="q-actions">
          <span />
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setOutcome({ correct: false, typed: "" })}
          >
            Don't know
          </button>
        </div>
      )}

      {outcome && (
        <Feedback
          outcome={outcome}
          answer={<SideView card={card} side={answerSide} zoomable />}
          onContinue={() => commitAndNext(outcome.correct)}
          onOverride={() => commitAndNext(true)}
        />
      )}
    </div>,
  );
}

function Feedback({
  outcome,
  answer,
  onContinue,
  onOverride,
}: {
  outcome: Outcome;
  answer: React.ReactNode;
  onContinue: () => void;
  onOverride: () => void;
}) {
  if (outcome.correct && outcome.grade !== "close") {
    return <div className="feedback good fb-head">Correct!</div>;
  }
  if (outcome.correct) {
    return (
      <div className="feedback good">
        <span className="fb-head">Almost — watch the spelling</span>
        <span className="fb-answer">{answer}</span>
        <div className="q-actions">
          <span className="faint">Press Enter to continue</span>
          <button className="btn btn-primary btn-sm" onClick={onContinue}>
            Continue
          </button>
        </div>
      </div>
    );
  }
  const typed = outcome.typed?.trim();
  return (
    <div className="feedback bad">
      <span className="fb-head">{typed || outcome.picked ? "Not quite" : "Here's the answer"}</span>
      {typed && <span className="fb-yours">{outcome.typed}</span>}
      <span className="fb-answer">{answer}</span>
      <div className="q-actions">
        {typed ? (
          <button className="btn btn-ghost btn-sm" onClick={onOverride}>
            I was right
          </button>
        ) : (
          <span className="faint">Press Enter to continue</span>
        )}
        <button className="btn btn-primary btn-sm" onClick={onContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
