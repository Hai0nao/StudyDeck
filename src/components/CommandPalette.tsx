import { FileText, Folder, Plus, RotateCcw, Search, Settings, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { normalize } from "@/lib/grading";
import { useStore } from "@/store/useStore";
import { openAi, useUi } from "@/store/ui";

interface Item {
  key: string;
  icon: ReactNode;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette() {
  const open = useUi((s) => s.palette);
  const close = () => useUi.setState({ palette: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useUi.setState((s) => ({ palette: !s.palette }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;
  return createPortal(<Palette onClose={close} />, document.body);
}

function Palette({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const sets = useStore((s) => s.sets);
  const folders = useStore((s) => s.folders);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => {
      onClose();
      nav(to);
    };
    const query = normalize(q);
    const actions: Item[] = [
      { key: "new", icon: <Plus />, label: "Create a new set", run: go("/sets/new") },
      { key: "review", icon: <RotateCcw />, label: "Review due cards", run: go("/review") },
      {
        key: "ai",
        icon: <Sparkles />,
        label: "Import with AI",
        run: () => {
          onClose();
          openAi(null);
        },
      },
      { key: "settings", icon: <Settings />, label: "Settings", run: go("/settings") },
    ].filter((a) => !query || normalize(a.label).includes(query));

    if (!query) {
      const recent = [...sets]
        .sort((a, b) => (b.studiedAt ?? b.updatedAt) - (a.studiedAt ?? a.updatedAt))
        .slice(0, 6)
        .map((s) => ({
          key: s.id,
          icon: <FileText />,
          label: s.title || "Untitled set",
          hint: `${s.cards.length} cards`,
          run: go(`/sets/${s.id}`),
        }));
      return [...recent, ...actions];
    }

    const setHits: Item[] = sets
      .filter((s) => normalize(`${s.title} ${s.description}`).includes(query))
      .slice(0, 8)
      .map((s) => ({
        key: s.id,
        icon: <FileText />,
        label: s.title || "Untitled set",
        hint: `${s.cards.length} cards`,
        run: go(`/sets/${s.id}`),
      }));
    const folderHits: Item[] = folders
      .filter((f) => normalize(f.name).includes(query))
      .slice(0, 4)
      .map((f) => ({
        key: f.id,
        icon: <Folder />,
        label: f.name,
        hint: "Folder",
        run: go(`/folders/${f.id}`),
      }));
    const cardHits: Item[] = [];
    for (const s of sets) {
      for (const c of s.cards) {
        if (cardHits.length >= 12) break;
        if (normalize(`${c.term} ${c.def}`).includes(query)) {
          cardHits.push({
            key: `${s.id}:${c.id}`,
            icon: <Search />,
            label: `${c.term} — ${c.def}`,
            hint: s.title,
            run: go(`/sets/${s.id}?card=${c.id}`),
          });
        }
      }
    }
    return [...setHits, ...folderHits, ...cardHits, ...actions];
  }, [q, sets, folders, nav, onClose]);

  const safeSel = Math.min(sel, Math.max(0, items.length - 1));

  return (
    <div
      className="veil palette-veil"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="palette" role="dialog" aria-label="Search">
        <div className="palette-input">
          <Search />
          <input
            autoFocus
            placeholder="Search sets, folders and cards…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((safeSel + 1) % Math.max(1, items.length));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((safeSel - 1 + items.length) % Math.max(1, items.length));
              } else if (e.key === "Enter") {
                items[safeSel]?.run();
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
          />
          <span className="kbd">Esc</span>
        </div>
        <div className="palette-list">
          {items.length === 0 && <p className="palette-empty">Nothing found for “{q}”.</p>}
          {items.map((it, i) => (
            <button
              key={it.key}
              className={`palette-item${i === safeSel ? " on" : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={it.run}
            >
              {it.icon}
              <span className="palette-label">{it.label}</span>
              {it.hint && <span className="palette-hint">{it.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
