import {
  ChevronRight,
  Folder as FolderIcon,
  FolderPlus,
  House,
  Layers,
  Library,
  Plus,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useReviewCounts } from "@/store/useReviewCounts";
import { SyncIndicator } from "./SyncIndicator";
import { useStore } from "@/store/useStore";
import { openAi, openFolderDialog, openPalette } from "@/store/ui";
import type { Folder } from "@/store/types";

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden>
      <Layers strokeWidth={2.4} />
    </span>
  );
}

function FolderTree() {
  const folders = useStore((s) => s.folders);
  const sets = useStore((s) => s.sets);
  const location = useLocation();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const children = useMemo(() => {
    const m = new Map<string | null, Folder[]>();
    for (const f of [...folders].sort((a, b) => a.name.localeCompare(b.name))) {
      m.set(f.parentId, [...(m.get(f.parentId) ?? []), f]);
    }
    return m;
  }, [folders]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sets) if (s.folderId) m.set(s.folderId, (m.get(s.folderId) ?? 0) + 1);
    return m;
  }, [sets]);

  const render = (parent: string | null, depth: number) =>
    (children.get(parent) ?? []).map((f) => {
      const kids = children.get(f.id)?.length ?? 0;
      const isOpen = open[f.id] ?? false;
      const active = location.pathname === `/folders/${f.id}`;
      return (
        <div key={f.id}>
          <div className={`tree-row${active ? " active" : ""}`} style={{ paddingLeft: depth * 14 }}>
            <button
              className={`caret${isOpen ? " open" : ""}`}
              onClick={() => setOpen((o) => ({ ...o, [f.id]: !isOpen }))}
              aria-label={isOpen ? "Collapse" : "Expand"}
              style={{ visibility: kids ? "visible" : "hidden" }}
            >
              <ChevronRight />
            </button>
            <Link to={`/folders/${f.id}`}>
              <FolderIcon />
              <span>{f.name}</span>
            </Link>
            {counts.get(f.id) ? <span className="n num">{counts.get(f.id)}</span> : null}
          </div>
          {isOpen && render(f.id, depth + 1)}
        </div>
      );
    });

  return (
    <>
      <div className="side-section">
        Folders
        <button
          className="icon-btn sm"
          onClick={() => openFolderDialog(null)}
          aria-label="New folder"
        >
          <FolderPlus />
        </button>
      </div>
      {folders.length ? (
        render(null, 0)
      ) : (
        <p className="faint" style={{ fontSize: 13, padding: "2px 10px" }}>
          No folders yet
        </p>
      )}
    </>
  );
}

export function Layout() {
  const { total } = useReviewCounts();
  const location = useLocation();
  const folderId = location.pathname.startsWith("/folders/")
    ? location.pathname.split("/")[2]
    : null;
  const createHref = folderId ? `/sets/new?folder=${folderId}` : "/sets/new";

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <BrandMark />
          StudyDeck
        </Link>
        <button className="side-search" onClick={openPalette}>
          <Search />
          Search
          <span className="kbd">Ctrl K</span>
        </button>
        <NavLink to="/" end className="nav-link">
          <House />
          Home
        </NavLink>
        <NavLink to="/library" className="nav-link">
          <Library />
          Library
        </NavLink>
        <NavLink to="/review" className="nav-link">
          <RotateCcw />
          Review
          {total > 0 && <span className="count num">{total > 999 ? "999+" : total}</span>}
        </NavLink>

        <div className="side-actions">
          <Link to={createHref} className="btn btn-primary btn-sm">
            <Plus />
            New set
          </Link>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => openAi(folderId)}
            title="Import with AI"
          >
            <Sparkles />
            AI
          </button>
        </div>

        <FolderTree />

        <div className="side-foot">
          <SyncIndicator />
          <NavLink to="/settings" className="nav-link">
            <SettingsIcon />
            Settings
          </NavLink>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <Link to="/" className="brand">
            <BrandMark />
            StudyDeck
          </Link>
          <button className="icon-btn" onClick={openPalette} aria-label="Search">
            <Search />
          </button>
          <button className="icon-btn" onClick={() => openAi(folderId)} aria-label="Import with AI">
            <Sparkles />
          </button>
        </header>
        <Outlet />
      </main>

      <nav className="tabbar">
        <NavLink to="/" end>
          <House />
          Home
        </NavLink>
        <NavLink to="/library">
          <Library />
          Library
        </NavLink>
        <Link to={createHref} className="fab" aria-label="New set">
          <span className="circle">
            <Plus />
          </span>
        </Link>
        <NavLink to="/review">
          <RotateCcw />
          Review
          {total > 0 && <span className="dot num">{total > 99 ? "99+" : total}</span>}
        </NavLink>
        <NavLink to="/settings">
          <SettingsIcon />
          Settings
        </NavLink>
      </nav>
    </div>
  );
}
