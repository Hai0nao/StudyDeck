import { useMemo, useState } from "react";
import { Modal, Segmented } from "@/components/ui";
import { parseCards, type CardSeparator, type RawCard, type TermSeparator } from "@/lib/parse";

export function ImportDialog({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (cards: RawCard[]) => void;
}) {
  const [text, setText] = useState("");
  const [termSep, setTermSep] = useState<TermSeparator>("auto");
  const [cardSep, setCardSep] = useState<CardSeparator>("newline");
  const [customTerm, setCustomTerm] = useState("");
  const [customCard, setCustomCard] = useState("");

  const cards = useMemo(
    () =>
      parseCards(text, {
        termSep,
        cardSep,
        customTermSep: customTerm,
        customCardSep: customCard.replace(/\\n/g, "\n"),
      }),
    [text, termSep, cardSep, customTerm, customCard],
  );

  return (
    <Modal
      wide
      title="Import cards"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!cards.length}
            onClick={() => {
              onImport(cards);
              onClose();
            }}
          >
            Import {cards.length || ""} cards
          </button>
        </>
      }
    >
      <label className="field">
        <span>Paste your data</span>
        <textarea
          className="textarea"
          rows={8}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"word 1\tdefinition 1\nword 2 - definition 2\nword 3: definition 3"}
        />
        <small>Copy from Quizlet (export), Google Sheets, Excel, Word or Notes.</small>
      </label>

      <div className="imp-opts">
        <div className="field">
          <span>Between term and definition</span>
          <Segmented
            value={termSep}
            onChange={setTermSep}
            options={[
              { value: "auto", label: "Auto" },
              { value: "tab", label: "Tab" },
              { value: "comma", label: "Comma" },
              { value: "dash", label: "Dash" },
              { value: "colon", label: "Colon" },
              { value: "custom", label: "Custom" },
            ]}
          />
          {termSep === "custom" && (
            <input
              className="input"
              value={customTerm}
              onChange={(e) => setCustomTerm(e.target.value)}
              placeholder="e.g. |"
            />
          )}
        </div>
        <div className="field">
          <span>Between cards</span>
          <Segmented
            value={cardSep}
            onChange={setCardSep}
            options={[
              { value: "newline", label: "New line" },
              { value: "semicolon", label: "Semicolon" },
              { value: "blank", label: "Blank line" },
              { value: "custom", label: "Custom" },
            ]}
          />
          {cardSep === "custom" && (
            <input
              className="input"
              value={customCard}
              onChange={(e) => setCustomCard(e.target.value)}
              placeholder="e.g. ;; (use \n for a line break)"
            />
          )}
        </div>
      </div>

      {cards.length > 0 && (
        <div className="field">
          <span>Preview · {cards.length} cards</span>
          <ul className="ai-preview imp-preview">
            {cards.slice(0, 8).map((c, i) => (
              <li key={i}>
                <label>
                  <b>{c.term || <em className="faint">empty</em>}</b>
                  <span>{c.def || <em className="faint">no definition</em>}</span>
                </label>
              </li>
            ))}
          </ul>
          {cards.length > 8 && <small>…and {cards.length - 8} more</small>}
        </div>
      )}
    </Modal>
  );
}
