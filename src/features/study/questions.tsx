import { useEffect, useRef, useState } from "react";
import { CardImage } from "@/components/CardImage";
import { gradeAnswer, type Grade } from "@/lib/grading";
import type { Card } from "@/store/types";
import { sideImage, sideText, type Side } from "./quiz";

/** Text and/or image of one side of a card. */
export function SideView({
  card,
  side,
  className = "",
  zoomable = false,
}: {
  card: Card;
  side: Side;
  className?: string;
  zoomable?: boolean;
}) {
  const text = sideText(card, side);
  const image = sideImage(card, side);
  return (
    <span className={`side-view ${className}`}>
      {image && <CardImage id={image} zoomable={zoomable} />}
      {text && <span className="side-text">{text}</span>}
    </span>
  );
}

/** Choices are card ids; each shows that card's answer side. */
export function MultipleChoice({
  choices,
  cards,
  side,
  answerId,
  picked,
  onPick,
}: {
  choices: string[];
  cards: Map<string, Card>;
  side: Side;
  answerId: string;
  picked: string | null;
  onPick: (cardId: string) => void;
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
      {choices.map((id, i) => {
        const card = cards.get(id);
        if (!card) return null;
        const state =
          picked === null ? "" : id === answerId ? "right" : id === picked ? "wrong" : "dim";
        return (
          <button
            key={id}
            className={`choice ${state}`}
            disabled={picked !== null}
            onClick={() => onPick(id)}
          >
            <span className="k">{i + 1}</span>
            <SideView card={card} side={side} />
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
