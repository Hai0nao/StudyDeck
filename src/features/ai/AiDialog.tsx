import { ArrowLeft, Check, ClipboardCopy, ExternalLink, KeyRound, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { FolderSelect } from "@/components/FolderPicker";
import { toast } from "@/components/toast";
import { Modal, Segmented } from "@/components/ui";
import {
  CHAT_URLS,
  chatPrompt,
  generateCards,
  hasKey,
  PROVIDER_LABELS,
  STYLE_LABELS,
  type AiRequest,
  type AiSource,
  type AiStyle,
} from "@/lib/ai";
import { parseAiReply, type RawCard } from "@/lib/parse";
import { useStore } from "@/store/useStore";
import { useUi } from "@/store/ui";
import "./ai.css";

type Method = "api" | "chat";

export type AiDialogProps =
  | { mode: "create"; folderId: string | null; onClose: () => void }
  | { mode: "append"; onAppend: (cards: RawCard[], title: string) => void; onClose: () => void };

/** Global instance opened from the sidebar / palette; creates a new set. */
export function AiDialogHost() {
  const req = useUi((s) => s.ai);
  if (!req) return null;
  return (
    <AiDialog mode="create" folderId={req.folderId} onClose={() => useUi.setState({ ai: null })} />
  );
}

const DRAFT_KEY = "studydeck.aiDraft";

export function AiDialog(props: AiDialogProps) {
  const ai = useStore((s) => s.settings.ai);
  const createSet = useStore((s) => s.createSet);
  const nav = useNavigate();
  const keyed = hasKey(ai);

  const [source, setSource] = useState<AiSource>("words");
  const [input, setInput] = useState(() => sessionStorage.getItem(DRAFT_KEY) ?? "");
  const [style, setStyle] = useState<AiStyle>("en");
  const [instructions, setInstructions] = useState("");
  const [method, setMethod] = useState<Method>(keyed ? "api" : "chat");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [result, setResult] = useState<{ title: string; cards: RawCard[] } | null>(null);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [title, setTitle] = useState("");
  const [folderId, setFolderId] = useState(props.mode === "create" ? props.folderId : null);

  const req: AiRequest = { source, input, style, instructions };

  const keepDraft = (v: string) => {
    setInput(v);
    try {
      sessionStorage.setItem(DRAFT_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const accept = (r: { title?: string; cards: RawCard[] }) => {
    if (!r.cards.length) {
      setError("No cards found in that reply. Make sure you pasted the whole JSON block.");
      return;
    }
    setResult({ title: r.title ?? "", cards: r.cards });
    setTitle(r.title || "New set");
    setSkip(new Set());
    setError("");
  };

  const runApi = async () => {
    if (!input.trim()) return setError("Add some words or text first.");
    setBusy(true);
    setError("");
    try {
      accept(await generateCards(ai, req));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const copyPrompt = async (open?: keyof typeof CHAT_URLS) => {
    if (!input.trim()) return setError("Add some words or text first.");
    setError("");
    const prompt = chatPrompt(req);
    try {
      await navigator.clipboard.writeText(prompt);
      toast("Prompt copied");
    } catch {
      toast("Couldn't copy automatically — select and copy the prompt manually");
    }
    if (open) {
      // Both sites prefill the chat box from ?q=; long prompts rely on the clipboard instead.
      const url =
        prompt.length < 6000
          ? `${CHAT_URLS[open]}?q=${encodeURIComponent(prompt)}`
          : CHAT_URLS[open];
      window.open(url, "_blank", "noopener");
    }
  };

  const save = () => {
    if (!result) return;
    const cards = result.cards.filter((_, i) => !skip.has(i));
    if (!cards.length) return;
    sessionStorage.removeItem(DRAFT_KEY);
    if (props.mode === "append") {
      props.onAppend(cards, title.trim());
      toast(`Added ${cards.length} cards to the editor`);
      props.onClose();
      return;
    }
    const id = createSet({ title: title.trim() || "New set", folderId }, cards);
    toast(`Created “${title.trim() || "New set"}”`);
    props.onClose();
    nav(`/sets/${id}`);
  };

  if (result) {
    const count = result.cards.length - skip.size;
    return (
      <Modal
        wide
        title="Review cards"
        onClose={props.onClose}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setResult(null)}>
              <ArrowLeft />
              Back
            </button>
            <button className="btn btn-primary" onClick={save} disabled={!count}>
              <Check />
              {props.mode === "append" ? `Add ${count} cards` : `Create set · ${count} cards`}
            </button>
          </>
        }
      >
        {props.mode === "create" && (
          <div className="ai-row">
            <label className="field" style={{ flex: 2 }}>
              <span>Title</span>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>Folder</span>
              <FolderSelect value={folderId} onChange={setFolderId} />
            </label>
          </div>
        )}
        <p className="hint">Untick anything you don't want. You can edit cards after saving.</p>
        <ul className="ai-preview">
          {result.cards.map((c, i) => (
            <li key={i} className={skip.has(i) ? "off" : ""}>
              <label>
                <input
                  type="checkbox"
                  checked={!skip.has(i)}
                  onChange={() =>
                    setSkip((s) => {
                      const n = new Set(s);
                      if (n.has(i)) n.delete(i);
                      else n.add(i);
                      return n;
                    })
                  }
                />
                <b>{c.term}</b>
                <span>{c.def}</span>
              </label>
            </li>
          ))}
        </ul>
      </Modal>
    );
  }

  return (
    <Modal
      wide
      title={
        <span className="ai-title">
          <Sparkles /> Import with AI
        </span>
      }
      onClose={props.onClose}
      footer={
        method === "api" ? (
          <>
            <button className="btn btn-ghost" onClick={props.onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={runApi} disabled={busy || !keyed}>
              {busy ? <span className="spinner" /> : <Sparkles />}
              {busy ? "Generating…" : `Generate with ${PROVIDER_LABELS[ai.provider]}`}
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={props.onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => accept(parseAiReply(reply))}
              disabled={!reply.trim()}
            >
              <Check />
              Read reply
            </button>
          </>
        )
      }
    >
      <div className="ai-row">
        <Segmented
          value={source}
          onChange={setSource}
          options={[
            { value: "words", label: "Word list" },
            { value: "text", label: "From text / notes" },
          ]}
        />
      </div>

      <label className="field">
        <span>{source === "words" ? "Words or phrases — one per line" : "Paste any text"}</span>
        <textarea
          className="textarea"
          rows={source === "words" ? 7 : 9}
          value={input}
          onChange={(e) => keepDraft(e.target.value)}
          placeholder={
            source === "words"
              ? "ubiquitous\nmitigate\ntake something for granted"
              : "An article, lecture notes, a chapter summary…"
          }
        />
      </label>

      <div className="ai-row">
        <label className="field" style={{ flex: 1 }}>
          <span>Card style</span>
          <select
            className="select"
            value={style}
            onChange={(e) => setStyle(e.target.value as AiStyle)}
          >
            {Object.entries(STYLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: 2 }}>
          <span>Extra instructions (optional)</span>
          <input
            className="input"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. add a Vietnamese meaning in brackets"
          />
        </label>
      </div>

      <div className="ai-method">
        <Segmented
          value={method}
          onChange={setMethod}
          options={[
            { value: "api", label: "API key" },
            { value: "chat", label: "Via Claude.ai / ChatGPT" },
          ]}
        />
        {method === "api" ? (
          keyed ? (
            <p className="hint">
              Uses your {PROVIDER_LABELS[ai.provider]} key ({ai.models[ai.provider]}). Change it in{" "}
              <Link to="/settings" onClick={props.onClose} className="link">
                Settings
              </Link>
              .
            </p>
          ) : (
            <div className="ai-nokey">
              <KeyRound />
              <p>
                No {PROVIDER_LABELS[ai.provider]} API key yet.{" "}
                <Link to="/settings" onClick={props.onClose} className="link">
                  Add one in Settings
                </Link>{" "}
                or use your Claude.ai / ChatGPT chat instead — no key needed.
              </p>
            </div>
          )
        ) : (
          <div className="ai-chat">
            <ol className="ai-steps">
              <li>
                Copy the prompt and send it in a new chat.
                <div className="ai-btns">
                  <button className="btn btn-secondary btn-sm" onClick={() => copyPrompt("claude")}>
                    <ExternalLink />
                    Open Claude
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => copyPrompt("openai")}>
                    <ExternalLink />
                    Open ChatGPT
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => copyPrompt()}>
                    <ClipboardCopy />
                    Copy only
                  </button>
                </div>
              </li>
              <li>
                Copy the whole reply and paste it here.
                <textarea
                  className="textarea"
                  rows={4}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder='{"title": "…", "cards": [{"term": "…", "definition": "…"}]}'
                />
              </li>
            </ol>
          </div>
        )}
      </div>

      {error && <p className="ai-error">{error}</p>}
    </Modal>
  );
}
