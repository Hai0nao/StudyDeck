import { Check, RotateCcw, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { toast } from "@/components/toast";
import { gradeAnswer } from "@/lib/grading";
import { useLocalState } from "@/lib/hooks";
import { sample, shuffle } from "@/lib/random";
import { useStore } from "@/store/useStore";
import type { Card, StudySet } from "@/store/types";
import { buildChoices, other, sideText, type Side } from "./quiz";
import { StudyShell } from "./StudyShell";

type Kind = "tf" | "mc" | "written" | "matching";

interface TestOptions {
  count: number;
  answerWith: Side | "both";
  kinds: Record<Kind, boolean>;
}

type Question =
  | { id: string; kind: "tf"; card: Card; prompt: Side; shown: string; isTrue: boolean }
  | { id: string; kind: "mc"; card: Card; prompt: Side; choices: string[] }
  | { id: string; kind: "written"; card: Card; prompt: Side }
  | { id: string; kind: "matching"; cards: Card[]; prompt: Side; options: string[] };

type Answers = Record<string, string | boolean | Record<string, string>>;

const KIND_LABELS: Record<Kind, string> = {
  tf: "True / False",
  mc: "Multiple choice",
  written: "Written",
  matching: "Matching",
};

export function TestPage() {
  const { id } = useParams();
  const set = useStore((s) => s.sets.find((x) => x.id === id));
  if (!set) return <Navigate to="/library" replace />;
  return <Test set={set} />;
}

function pickPrompt(answerWith: TestOptions["answerWith"]): Side {
  if (answerWith === "both") return Math.random() < 0.5 ? "term" : "def";
  return other(answerWith);
}

function buildTest(set: StudySet, opts: TestOptions): Question[] {
  const usable = set.cards.filter((c) => c.term.trim() && c.def.trim());
  const cards = sample(usable, Math.min(opts.count, usable.length));
  let kinds = (Object.keys(opts.kinds) as Kind[]).filter((k) => opts.kinds[k]);
  if (usable.length < 3) kinds = kinds.filter((k) => k === "written" || k === "tf");
  if (!kinds.length) kinds = ["written"];

  // Split cards evenly across the chosen kinds; matching takes groups of up to 5.
  const buckets = new Map<Kind, Card[]>(kinds.map((k) => [k, []]));
  cards.forEach((c, i) => buckets.get(kinds[i % kinds.length])!.push(c));

  const out: Question[] = [];
  let n = 0;
  const qid = () => `q${n++}`;
  for (const kind of ["tf", "mc", "written", "matching"] as Kind[]) {
    const list = buckets.get(kind) ?? [];
    if (kind === "matching") {
      for (let i = 0; i < list.length; i += 5) {
        const group = list.slice(i, i + 5);
        if (group.length < 2) {
          // a lone leftover becomes a written question
          group.forEach((card) =>
            out.push({ id: qid(), kind: "written", card, prompt: pickPrompt(opts.answerWith) }),
          );
          continue;
        }
        const prompt = pickPrompt(opts.answerWith);
        out.push({
          id: qid(),
          kind: "matching",
          cards: group,
          prompt,
          options: shuffle(group.map((c) => sideText(c, other(prompt)))),
        });
      }
      continue;
    }
    for (const card of list) {
      const prompt = pickPrompt(opts.answerWith);
      if (kind === "tf") {
        const isTrue = Math.random() < 0.5 || usable.length < 2;
        const decoy = shuffle(usable).find(
          (c) => c.id !== card.id && sideText(c, other(prompt)) !== sideText(card, other(prompt)),
        );
        out.push({
          id: qid(),
          kind,
          card,
          prompt,
          isTrue: isTrue || !decoy,
          shown: isTrue || !decoy ? sideText(card, other(prompt)) : sideText(decoy, other(prompt)),
        });
      } else if (kind === "mc") {
        out.push({
          id: qid(),
          kind,
          card,
          prompt,
          choices: buildChoices(card, usable, other(prompt)),
        });
      } else {
        out.push({ id: qid(), kind, card, prompt });
      }
    }
  }
  return out;
}

/** Per-card correctness for a question. */
function grade(
  q: Question,
  a: Answers[string] | undefined,
  lenient: boolean,
): { cardId: string; ok: boolean }[] {
  switch (q.kind) {
    case "tf":
      return [{ cardId: q.card.id, ok: a === q.isTrue }];
    case "mc":
      return [{ cardId: q.card.id, ok: a === sideText(q.card, other(q.prompt)) }];
    case "written":
      return [
        {
          cardId: q.card.id,
          ok:
            typeof a === "string" &&
            gradeAnswer(a, sideText(q.card, other(q.prompt)), lenient) !== "wrong",
        },
      ];
    case "matching": {
      const picks = (a ?? {}) as Record<string, string>;
      return q.cards.map((c) => ({
        cardId: c.id,
        ok: picks[c.id] === sideText(c, other(q.prompt)),
      }));
    }
  }
}

function Test({ set }: { set: StudySet }) {
  const lenient = useStore((s) => s.settings.lenient);
  const { recordAnswer, markStudied } = useStore.getState();
  const [opts, setOpts] = useLocalState<TestOptions>("studydeck.test", {
    count: 20,
    answerWith: "def",
    kinds: { tf: true, mc: true, written: true, matching: false },
  });
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [submitted, setSubmitted] = useState(false);

  const max = set.cards.length;
  const count = Math.min(Math.max(1, opts.count), max);

  const results = useMemo(() => {
    if (!questions || !submitted) return null;
    const per = new Map(questions.map((q) => [q.id, grade(q, answers[q.id], lenient)]));
    const all = [...per.values()].flat();
    return { per, right: all.filter((r) => r.ok).length, total: all.length };
  }, [questions, answers, submitted, lenient]);

  const start = () => {
    setQuestions(buildTest(set, { ...opts, count }));
    setAnswers({});
    setSubmitted(false);
    markStudied(set.id);
    window.scrollTo(0, 0);
  };

  const submit = () => {
    if (!questions) return;
    const unanswered = questions.filter(
      (q) => answers[q.id] === undefined || answers[q.id] === "",
    ).length;
    if (unanswered && !window.confirm(`${unanswered} question(s) unanswered. Submit anyway?`))
      return;
    for (const q of questions) {
      for (const r of grade(q, answers[q.id], lenient)) recordAnswer(set.id, r.cardId, r.ok);
    }
    setSubmitted(true);
    toast("Test graded");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const setAnswer = (id: string, v: Answers[string]) =>
    !submitted && setAnswers((a) => ({ ...a, [id]: v }));

  if (!questions) {
    const kindsOn = Object.values(opts.kinds).filter(Boolean).length;
    return (
      <StudyShell title={set.title} mode="Test" exitTo={`/sets/${set.id}`}>
        <div className="test-setup">
          <div>
            <p className="label">Set up your test</p>
            <h2>{set.title}</h2>
          </div>
          <div className="field">
            <span>Questions</span>
            <div className="range-row">
              <input
                type="range"
                min={1}
                max={max}
                value={count}
                onChange={(e) => setOpts({ count: Number(e.target.value) })}
              />
              <b className="num">{count}</b>
            </div>
          </div>
          <div className="field">
            <span>Answer with</span>
            <div className="chips">
              {(["def", "term", "both"] as const).map((v) => (
                <button
                  key={v}
                  className={`chip${opts.answerWith === v ? " on" : ""}`}
                  onClick={() => setOpts({ answerWith: v })}
                >
                  {v === "def" ? "Definition" : v === "term" ? "Term" : "Both"}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Question types</span>
            <div className="chips">
              {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
                <button
                  key={k}
                  className={`chip${opts.kinds[k] ? " on" : ""}`}
                  onClick={() => {
                    if (opts.kinds[k] && kindsOn === 1) return;
                    setOpts({ kinds: { ...opts.kinds, [k]: !opts.kinds[k] } });
                  }}
                >
                  {opts.kinds[k] && <Check />}
                  {KIND_LABELS[k]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <button className="btn btn-primary btn-lg" onClick={start} autoFocus>
              Start test
            </button>
          </div>
        </div>
      </StudyShell>
    );
  }

  const answeredCount = questions.filter(
    (q) => answers[q.id] !== undefined && answers[q.id] !== "",
  ).length;
  const pct = results ? Math.round((results.right / Math.max(1, results.total)) * 100) : 0;

  return (
    <StudyShell
      title={set.title}
      mode="Test"
      exitTo={`/sets/${set.id}`}
      progress={submitted ? 100 : (answeredCount / questions.length) * 100}
    >
      {results && (
        <div className="score panel">
          <div className="score-ring" style={{ ["--p" as string]: pct }}>
            <span className="num">{pct}%</span>
          </div>
          <div style={{ flex: 1 }}>
            <h2>
              {pct >= 90
                ? "Excellent!"
                : pct >= 70
                  ? "Good job"
                  : pct >= 50
                    ? "Getting there"
                    : "Keep practising"}
            </h2>
            <p className="muted num">
              {results.right} of {results.total} correct
            </p>
            <div className="finish-actions" style={{ justifyContent: "flex-start", marginTop: 12 }}>
              <button className="btn btn-primary" onClick={start}>
                <RotateCcw />
                New test
              </button>
              <Link to={`/sets/${set.id}/learn`} className="btn btn-secondary">
                Practise in Learn
              </Link>
            </div>
          </div>
        </div>
      )}

      {questions.map((q, i) => {
        const res = results?.per.get(q.id);
        const allOk = res?.every((r) => r.ok);
        return (
          <div
            key={q.id}
            className={`q-card test-q${res ? (allOk ? " graded-right" : " graded-wrong") : ""}`}
          >
            <div className="q-top">
              <span>{KIND_LABELS[q.kind]}</span>
              <span className="num">
                {res ? (
                  allOk ? (
                    <Check size={16} color="var(--good)" />
                  ) : (
                    <X size={16} color="var(--again)" />
                  )
                ) : null}{" "}
                {i + 1} / {questions.length}
              </span>
            </div>
            <QuestionBody
              q={q}
              value={answers[q.id]}
              onChange={(v) => setAnswer(q.id, v)}
              graded={!!res}
              lenient={lenient}
            />
          </div>
        );
      })}

      {!submitted && (
        <div className="test-submit">
          <button className="btn btn-primary btn-lg" onClick={submit}>
            Submit test
          </button>
        </div>
      )}
    </StudyShell>
  );
}

function QuestionBody({
  q,
  value,
  onChange,
  graded,
  lenient,
}: {
  q: Question;
  value: Answers[string] | undefined;
  onChange: (v: Answers[string]) => void;
  graded: boolean;
  lenient: boolean;
}) {
  if (q.kind === "matching") {
    const picks = (value ?? {}) as Record<string, string>;
    return (
      <div className="match-q">
        <p className="q-ask">
          Match each {q.prompt === "term" ? "term" : "definition"} with its answer
        </p>
        {q.cards.map((c) => {
          const right = sideText(c, other(q.prompt));
          const ok = picks[c.id] === right;
          return (
            <div key={c.id} className="match-q-row">
              <b>{sideText(c, q.prompt)}</b>
              <select
                className={`select${graded ? (ok ? " right" : " wrong") : ""}`}
                value={picks[c.id] ?? ""}
                disabled={graded}
                onChange={(e) => onChange({ ...picks, [c.id]: e.target.value })}
              >
                <option value="">Choose…</option>
                {q.options.map((o, i) => (
                  <option key={i} value={o}>
                    {o.length > 80 ? `${o.slice(0, 80)}…` : o}
                  </option>
                ))}
              </select>
              {graded && !ok && <small>{right}</small>}
            </div>
          );
        })}
      </div>
    );
  }

  const prompt = sideText(q.card, q.prompt);
  const answer = sideText(q.card, other(q.prompt));

  if (q.kind === "tf") {
    return (
      <>
        <div className="tf-pair">
          <div>
            <span className="q-ask">{q.prompt === "term" ? "Term" : "Definition"}</span>
            <div className="q-prompt">{prompt}</div>
          </div>
          <div>
            <span className="q-ask">{q.prompt === "term" ? "Definition" : "Term"}</span>
            <div className="q-prompt">{q.shown}</div>
          </div>
        </div>
        <div className="tf-row">
          {[true, false].map((v) => {
            const state = !graded
              ? value === v
                ? "right"
                : ""
              : v === q.isTrue
                ? "right"
                : value === v
                  ? "wrong"
                  : "dim";
            return (
              <button
                key={String(v)}
                className={`choice ${state}`}
                style={
                  !graded && value === v
                    ? { borderColor: "var(--accent)", background: "var(--accent-soft)" }
                    : undefined
                }
                disabled={graded}
                onClick={() => onChange(v)}
              >
                {v ? "True" : "False"}
              </button>
            );
          })}
        </div>
        {graded && !q.isTrue && <p className="q-ask">Correct match: {answer}</p>}
      </>
    );
  }

  return (
    <>
      <div className={`q-prompt${prompt.length > 90 ? " long" : ""}`}>{prompt}</div>
      {q.kind === "mc" ? (
        <div className="choices">
          {q.choices.map((c, i) => {
            const state = !graded ? "" : c === answer ? "right" : c === value ? "wrong" : "dim";
            const picked = !graded && value === c;
            return (
              <button
                key={i}
                className={`choice ${state}`}
                style={
                  picked
                    ? { borderColor: "var(--accent)", background: "var(--accent-soft)" }
                    : undefined
                }
                disabled={graded}
                onClick={() => onChange(c)}
              >
                <span className="k">{i + 1}</span>
                <span>{c}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <div className="write-row">
            <input
              className={`input${graded ? (gradeAnswer(String(value ?? ""), answer, lenient) !== "wrong" ? " right" : " wrong") : ""}`}
              value={String(value ?? "")}
              disabled={graded}
              placeholder="Type the answer"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
          {graded && gradeAnswer(String(value ?? ""), answer, lenient) === "wrong" && (
            <p className="q-ask">Answer: {answer}</p>
          )}
        </>
      )}
    </>
  );
}
