import {
  BookOpenCheck,
  ChevronRight,
  ClipboardCopy,
  Copy,
  Download,
  FolderInput,
  GalleryVerticalEnd,
  Grid2x2,
  ListChecks,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  RotateCw,
  Star,
  Trash2,
  Volume2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { confirm } from "@/components/confirm";
import { FolderSelect } from "@/components/FolderPicker";
import { MasteryBar } from "@/components/SetCard";
import { toast } from "@/components/toast";
import { Menu, Modal, Segmented } from "@/components/ui";
import { downloadFile } from "@/lib/backup";
import { folderPath } from "@/lib/library";
import { useNow } from "@/lib/hooks";
import { isDue } from "@/lib/srs";
import { speak } from "@/lib/speech";
import { relativeDue, timeAgo } from "@/lib/time";
import { dueCount, setMastery, useStore } from "@/store/useStore";
import "./set.css";

type Filter = "all" | "starred" | "due";

export function SetPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const set = useStore((s) => s.sets.find((x) => x.id === id));
  const folders = useStore((s) => s.folders);
  const settings = useStore((s) => s.settings);
  const { toggleStar, deleteSet, duplicateSet, resetProgress, updateSet } = useStore.getState();
  const nav = useNavigate();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>("all");
  const [moving, setMoving] = useState(false);
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const focusCard = params.get("card");

  useEffect(() => {
    if (!focusCard) return;
    document.getElementById(`card-${focusCard}`)?.scrollIntoView({ block: "center" });
  }, [focusCard]);

  const cards = useMemo(() => {
    if (!set) return [];
    if (filter === "starred") return set.cards.filter((c) => c.star);
    if (filter === "due") return set.cards.filter((c) => isDue(c, now));
    return set.cards;
  }, [set, filter, now]);

  if (!set) return <Navigate to="/library" replace />;

  const m = setMastery(set);
  const due = dueCount(set, now);
  const starred = set.cards.filter((c) => c.star).length;
  const path = folderPath(folders, set.folderId);
  const enough = set.cards.length >= 2;

  const asText = () => set.cards.map((c) => `${c.term}\t${c.def}`).join("\n");
  const remove = async () => {
    const ok = await confirm(
      `Delete “${set.title}”?`,
      `All ${set.cards.length} cards and their progress will be removed.`,
    );
    if (!ok) return;
    deleteSet(set.id);
    toast("Set deleted");
    nav(set.folderId ? `/folders/${set.folderId}` : "/library");
  };

  const modes = [
    { to: "flashcards", icon: <GalleryVerticalEnd />, label: "Flashcards", note: "Flip through" },
    { to: "learn", icon: <BookOpenCheck />, label: "Learn", note: "Adaptive rounds" },
    { to: "test", icon: <ListChecks />, label: "Test", note: "Mixed questions" },
    {
      to: "match",
      icon: <Grid2x2 />,
      label: "Match",
      note: set.matchBest ? `Best ${(set.matchBest / 1000).toFixed(1)}s` : "Beat the clock",
    },
  ];

  return (
    <div className="page narrow">
      <nav className="crumbs">
        <Link to="/library">Library</Link>
        {path.map((f) => (
          <span key={f.id} style={{ display: "contents" }}>
            <ChevronRight />
            <Link to={`/folders/${f.id}`}>{f.name}</Link>
          </span>
        ))}
      </nav>

      <div className="page-head set-head">
        <div>
          <h1>{set.title || "Untitled set"}</h1>
          {set.description && <p>{set.description}</p>}
          <p className="set-meta num">
            {set.cards.length} cards · updated {timeAgo(set.updatedAt, now)}
            {set.studiedAt && ` · studied ${timeAgo(set.studiedAt, now)}`}
          </p>
        </div>
        <div className="head-actions">
          <Link to={`/sets/${set.id}/edit`} className="btn btn-secondary">
            <Pencil />
            Edit
          </Link>
          <Menu
            trigger={(toggle) => (
              <button className="icon-btn" onClick={toggle} aria-label="Set options">
                <MoreHorizontal />
              </button>
            )}
            items={[
              {
                label: "Duplicate",
                icon: <Copy />,
                onClick: () => {
                  const nid = duplicateSet(set.id);
                  toast("Set duplicated");
                  if (nid) nav(`/sets/${nid}`);
                },
              },
              {
                label: "Move to folder",
                icon: <FolderInput />,
                onClick: () => {
                  setMoveTarget(set.folderId);
                  setMoving(true);
                },
              },
              {
                label: "Copy as text",
                icon: <ClipboardCopy />,
                onClick: () =>
                  navigator.clipboard.writeText(asText()).then(
                    () => toast("Copied — paste into Quizlet, Anki or a sheet"),
                    () => toast("Couldn't access the clipboard"),
                  ),
              },
              {
                label: "Download .tsv",
                icon: <Download />,
                onClick: () =>
                  downloadFile(`${set.title || "set"}.tsv`, asText(), "text/tab-separated-values"),
              },
              { label: "", onClick: () => {}, divider: true },
              {
                label: "Reset progress",
                icon: <RotateCw />,
                onClick: async () => {
                  if (
                    await confirm(
                      "Reset progress?",
                      "Review schedule, Learn progress and stats for this set go back to zero.",
                      { confirmLabel: "Reset" },
                    )
                  ) {
                    resetProgress(set.id);
                    toast("Progress reset");
                  }
                },
              },
              { label: "Delete set", icon: <Trash2 />, onClick: remove, danger: true },
            ]}
          />
        </div>
      </div>

      <div className="modes">
        {modes.map((md) => (
          <Link
            key={md.to}
            to={enough ? `/sets/${set.id}/${md.to}` : "#"}
            className={`mode${enough ? "" : " disabled"}`}
            onClick={(e) => {
              if (!enough) {
                e.preventDefault();
                toast("Add at least 2 cards first");
              }
            }}
          >
            {md.icon}
            <b>{md.label}</b>
            <span>{md.note}</span>
          </Link>
        ))}
      </div>

      <Link to={`/review?set=${set.id}`} className={`review-strip${due ? " hot" : ""}`}>
        <RotateCcw />
        <div>
          <b>Spaced review</b>
          <span>
            {due
              ? `${due} ${due === 1 ? "card is" : "cards are"} due now`
              : m.fresh
                ? `${m.fresh} new cards ready to start`
                : "Nothing due — come back later"}
          </span>
        </div>
        <ChevronRight className="chev" />
      </Link>

      <div className="mastery panel">
        <div className="mastery-nums">
          <div>
            <b className="num" style={{ color: "var(--good)" }}>
              {m.known}
            </b>
            <span>Known</span>
          </div>
          <div>
            <b className="num" style={{ color: "var(--hard)" }}>
              {m.learning}
            </b>
            <span>Learning</span>
          </div>
          <div>
            <b className="num">{m.fresh}</b>
            <span>New</span>
          </div>
        </div>
        <MasteryBar set={set} />
      </div>

      <div className="section-title">
        <h2>Cards</h2>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All ${set.cards.length}` },
            { value: "starred", label: `Starred ${starred}` },
            { value: "due", label: `Due ${due}` },
          ]}
        />
      </div>

      {cards.length === 0 ? (
        <p className="muted" style={{ padding: "12px 2px" }}>
          {filter === "starred"
            ? "Star cards to practise them on their own."
            : filter === "due"
              ? "No cards are due right now."
              : "This set has no cards yet."}
        </p>
      ) : (
        <ul className="card-list">
          {cards.map((c) => (
            <li key={c.id} id={`card-${c.id}`} className={focusCard === c.id ? "focus" : ""}>
              <div className="cl-term">{c.term}</div>
              <div className="cl-def">{c.def}</div>
              <div className="cl-side">
                <span className="cl-due faint num" title="Next review">
                  {c.srs.state === 0 ? "new" : relativeDue(c.srs.due, now)}
                </span>
                <button
                  className="icon-btn sm"
                  onClick={() => speak(c.term, set.termLang, settings.speech.rate)}
                  aria-label="Play audio"
                >
                  <Volume2 />
                </button>
                <button
                  className={`icon-btn sm${c.star ? " on" : ""}`}
                  onClick={() => toggleStar(set.id, c.id)}
                  aria-label={c.star ? "Unstar" : "Star"}
                >
                  <Star fill={c.star ? "currentColor" : "none"} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="set-foot">
        <Link to={`/sets/${set.id}/edit`} className="btn btn-secondary">
          <Pencil />
          Add or edit cards
        </Link>
      </div>

      {moving && (
        <Modal
          title="Move set"
          onClose={() => setMoving(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setMoving(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  updateSet(set.id, { folderId: moveTarget });
                  setMoving(false);
                  toast("Set moved");
                }}
              >
                Move
              </button>
            </>
          }
        >
          <label className="field">
            <span>Folder</span>
            <FolderSelect value={moveTarget} onChange={setMoveTarget} />
          </label>
        </Modal>
      )}
    </div>
  );
}
