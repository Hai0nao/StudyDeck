import {
  ArrowLeftRight,
  ChevronDown,
  FileInput,
  GripVertical,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ImageSlot } from "@/components/CardImage";
import { FolderSelect } from "@/components/FolderPicker";
import { toast } from "@/components/toast";
import { uid } from "@/lib/id";
import { addImage, imageFromTransfer } from "@/lib/images";
import type { RawCard } from "@/lib/parse";
import { SPEECH_LANGS } from "@/lib/speech";
import { useStore } from "@/store/useStore";
import { AiDialog } from "../ai/AiDialog";
import { ImportDialog } from "./ImportDialog";
import "./editor.css";

interface Row {
  key: string;
  id?: string;
  term: string;
  def: string;
  termImage: string | null;
  defImage: string | null;
}

const blank = (): Row => ({ key: uid(), term: "", def: "", termImage: null, defImage: null });
const isBlank = (r: Row) => !r.term.trim() && !r.def.trim() && !r.termImage && !r.defImage;
const swapRow = (r: Row): Row => ({
  ...r,
  term: r.def,
  def: r.term,
  termImage: r.defImage,
  defImage: r.termImage,
});

function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={1} {...props} />;
}

export function EditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const existing = useStore((s) => (id ? s.sets.find((x) => x.id === id) : undefined));
  const { createSet, updateSet, saveCards } = useStore.getState();
  const nav = useNavigate();

  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [folderId, setFolderId] = useState<string | null>(
    existing ? existing.folderId : params.get("folder"),
  );
  const [termLang, setTermLang] = useState(existing?.termLang ?? "");
  const [defLang, setDefLang] = useState(existing?.defLang ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    existing?.cards.length
      ? existing.cards.map((c) => ({
          key: c.id,
          id: c.id,
          term: c.term,
          def: c.def,
          termImage: c.termImage ?? null,
          defImage: c.defImage ?? null,
        }))
      : [blank(), blank(), blank()],
  );
  const [showOptions, setShowOptions] = useState(false);
  const [importing, setImporting] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const focusNext = useRef<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!focusNext.current) return;
    document.querySelector<HTMLTextAreaElement>(`[data-term="${focusNext.current}"]`)?.focus();
    focusNext.current = null;
  });

  const edit = (fn: (rows: Row[]) => Row[]) => {
    setRows(fn);
    setDirty(true);
  };
  const setField = (key: string, field: "term" | "def", value: string) =>
    edit((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  const setImage = (key: string, field: "termImage" | "defImage", value: string | null) =>
    edit((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  /** Ctrl+V an image while typing in a field puts it on that side of the card. */
  const onPasteImage = async (
    e: React.ClipboardEvent<HTMLTextAreaElement>,
    key: string,
    field: "termImage" | "defImage",
  ) => {
    const file = imageFromTransfer(e.clipboardData);
    if (!file) return;
    e.preventDefault();
    try {
      setImage(key, field, await addImage(file));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't add that image");
    }
  };

  const addRow = (after?: string) => {
    const r = blank();
    focusNext.current = r.key;
    edit((rs) => {
      if (!after) return [...rs, r];
      const i = rs.findIndex((x) => x.key === after);
      return [...rs.slice(0, i + 1), r, ...rs.slice(i + 1)];
    });
  };

  const appendCards = (cards: RawCard[], aiTitle?: string) => {
    edit((rs) => [
      ...rs.filter((r) => !isBlank(r)),
      ...cards.map((c) => ({ ...blank(), term: c.term, def: c.def })),
    ]);
    if (!title.trim() && aiTitle) setTitle(aiTitle);
  };

  const onDefKey = (e: KeyboardEvent<HTMLTextAreaElement>, index: number) => {
    // Tab on the last definition adds a new card, like Quizlet.
    if (e.key === "Tab" && !e.shiftKey && index === rows.length - 1) {
      e.preventDefault();
      addRow();
    }
  };

  const save = () => {
    const cards = rows.filter((r) => !isBlank(r));
    if (!cards.length) {
      toast("Add at least one card");
      return;
    }
    const meta = {
      title: title.trim() || "Untitled set",
      description: description.trim(),
      folderId,
      termLang,
      defLang,
    };
    setDirty(false);
    if (existing) {
      updateSet(existing.id, meta);
      saveCards(existing.id, cards);
      toast("Saved");
      nav(`/sets/${existing.id}`);
    } else {
      const newId = createSet(meta, cards);
      toast("Set created");
      nav(`/sets/${newId}`);
    }
  };

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "Enter")) {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const filled = rows.filter((r) => !isBlank(r)).length;
  const cancelTo = existing
    ? `/sets/${existing.id}`
    : folderId
      ? `/folders/${folderId}`
      : "/library";

  return (
    <div className="page narrow editor">
      <div className="editor-bar">
        <div>
          <h1>{existing ? "Edit set" : "New set"}</h1>
          <span className="faint num">{filled} cards</span>
        </div>
        <div className="head-actions">
          <Link to={cancelTo} className="btn btn-ghost" onClick={() => setDirty(false)}>
            Cancel
          </Link>
          <button className="btn btn-primary" onClick={save}>
            {existing ? "Save" : "Create"}
          </button>
        </div>
      </div>

      <div className="editor-meta">
        <input
          className="input input-lg"
          placeholder="Title, e.g. “IELTS Unit 4 — Environment”"
          value={title}
          autoFocus={!existing}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
        />
        <textarea
          className="textarea"
          rows={2}
          style={{ minHeight: 0 }}
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setDirty(true);
          }}
        />
        <button className="options-toggle" onClick={() => setShowOptions((v) => !v)}>
          <ChevronDown className={showOptions ? "open" : ""} />
          Folder & audio options
        </button>
        {showOptions && (
          <div className="editor-options">
            <label className="field">
              <span>Folder</span>
              <FolderSelect
                value={folderId}
                onChange={(v) => {
                  setFolderId(v);
                  setDirty(true);
                }}
              />
            </label>
            <label className="field">
              <span>Term language</span>
              <select
                className="select"
                value={termLang}
                onChange={(e) => {
                  setTermLang(e.target.value);
                  setDirty(true);
                }}
              >
                {SPEECH_LANGS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Definition language</span>
              <select
                className="select"
                value={defLang}
                onChange={(e) => {
                  setDefLang(e.target.value);
                  setDirty(true);
                }}
              >
                {SPEECH_LANGS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      <div className="editor-tools">
        <button className="btn btn-secondary btn-sm" onClick={() => setImporting(true)}>
          <FileInput />
          Import text
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setAiOpen(true)}>
          <Sparkles />
          Add with AI
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => edit((rs) => rs.map(swapRow))}
          title="Swap terms and definitions"
        >
          <ArrowLeftRight />
          Swap sides
        </button>
      </div>

      <ol className="rows">
        {rows.map((r, i) => (
          <li
            key={r.key}
            className={`row${dragKey === r.key ? " dragging" : ""}`}
            onDragOver={(e) => {
              if (!dragKey || dragKey === r.key) return;
              e.preventDefault();
              edit((rs) => {
                const from = rs.findIndex((x) => x.key === dragKey);
                const to = rs.findIndex((x) => x.key === r.key);
                const next = [...rs];
                const [moved] = next.splice(from, 1);
                next.splice(to, 0, moved);
                return next;
              });
            }}
          >
            <div className="row-head">
              <span className="row-n num">{i + 1}</span>
              <span
                className="row-grip"
                draggable
                onDragStart={(e) => {
                  setDragKey(r.key);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => setDragKey(null)}
                title="Drag to reorder"
              >
                <GripVertical />
              </span>
              <span style={{ flex: 1 }} />
              <button
                className="icon-btn sm"
                onClick={() => edit((rs) => rs.map((x) => (x.key === r.key ? swapRow(x) : x)))}
                aria-label="Swap sides"
              >
                <ArrowLeftRight />
              </button>
              <button
                className="icon-btn sm"
                onClick={() =>
                  edit((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [blank()]))
                }
                aria-label="Delete card"
              >
                <Trash2 />
              </button>
            </div>
            <div className="row-fields">
              <div className="row-side">
                <label>
                  <AutoTextarea
                    data-term={r.key}
                    value={r.term}
                    placeholder="Term"
                    onChange={(e) => setField(r.key, "term", e.target.value)}
                    onPaste={(e) => onPasteImage(e, r.key, "termImage")}
                  />
                  <span>Term</span>
                </label>
                <ImageSlot
                  label="term"
                  value={r.termImage}
                  onChange={(v) => setImage(r.key, "termImage", v)}
                />
              </div>
              <div className="row-side">
                <label>
                  <AutoTextarea
                    value={r.def}
                    placeholder="Definition"
                    onChange={(e) => setField(r.key, "def", e.target.value)}
                    onKeyDown={(e) => onDefKey(e, i)}
                    onPaste={(e) => onPasteImage(e, r.key, "defImage")}
                  />
                  <span>Definition</span>
                </label>
                <ImageSlot
                  label="definition"
                  value={r.defImage}
                  onChange={(v) => setImage(r.key, "defImage", v)}
                />
              </div>
            </div>
          </li>
        ))}
      </ol>

      <button className="add-row" onClick={() => addRow()}>
        <Plus />
        Add card
      </button>

      <div className="editor-foot">
        <span className="faint">
          <span className="kbd">Tab</span> on the last card adds another ·{" "}
          <span className="kbd">Ctrl</span> + <span className="kbd">S</span> saves
        </span>
        <button className="btn btn-primary btn-lg" onClick={save}>
          {existing ? "Save changes" : "Create set"}
        </button>
      </div>

      {importing && (
        <ImportDialog onClose={() => setImporting(false)} onImport={(c) => appendCards(c)} />
      )}
      {aiOpen && (
        <AiDialog
          mode="append"
          onClose={() => setAiOpen(false)}
          onAppend={(c, t) => appendCards(c, t)}
        />
      )}
    </div>
  );
}
