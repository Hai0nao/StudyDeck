import { useEffect, useRef, useState } from "react";
import { gradeAnswer, type Grade } from "@/lib/grading";

export function MultipleChoice({
  choices,
  answer,
  picked,
  onPick,
}: {
  choices: string[];
  answer: string;
  picked: string | null;
  onPick: (choice: string) => void;
}) {
  useEffect(() => {
    if (picked !== null) return;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= choices.length) onPick(choices[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choices, picked, onPick]);

  return (
    <div className="choices">
      {choices.map((c, i) => {
        const state =
          picked === null ? "" : c === answer ? "right" : c === picked ? "wrong" : "dim";
        return (
          <button
            key={i}
            className={`choice ${state}`}
            disabled={picked !== null}
            onClick={() => onPick(c)}
          >
            <span className="k">{i + 1}</span>
            <span>{c}</span>
          </button>
        );
      })}
    </div>
  );
}

export function WrittenAnswer({
  answer,
  lenient,
  onGraded,
  disabled,
}: {
  answer: string;
  lenient: boolean;
  onGraded: (grade: Grade, typed: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!disabled) ref.current?.focus();
  }, [disabled]);

  const submit = () => {
    if (disabled) return;
    onGraded(value.trim() ? gradeAnswer(value, answer, lenient) : "wrong", value);
  };

  return (
    <div className="write-row">
      <input
        ref={ref}
        className="input"
        value={value}
        disabled={disabled}
        placeholder="Type the answer"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            submit();
          }
        }}
      />
      <button
        className="btn btn-primary"
        style={{ height: 50 }}
        onClick={submit}
        disabled={disabled}
      >
        Answer
      </button>
    </div>
  );
}
