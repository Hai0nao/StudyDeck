import { FileText, FolderPlus, Plus, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { FolderCard, SetCard } from "@/components/SetCard";
import { Empty } from "@/components/ui";
import { normalize } from "@/lib/grading";
import { useNow } from "@/lib/hooks";
import { sortSets, type SortKey } from "@/lib/library";
import { useStore } from "@/store/useStore";
import { openAi, openFolderDialog } from "@/store/ui";
import "./library.css";

export function SortSelect({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (v: SortKey) => void;
}) {
  return (
    <select
      className="select lib-sort"
      value={value}
      onChange={(e) => onChange(e.target.value as SortKey)}
      aria-label="Sort sets"
    >
      <option value="recent">Recent</option>
      <option value="title">A → Z</option>
      <option value="due">Most due</option>
      <option value="size">Most cards</option>
    </select>
  );
}

export function LibraryPage() {
  const sets = useStore((s) => s.sets);
  const folders = useStore((s) => s.folders);
  const now = useNow();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const rootFolders = folders
    .filter((f) => !f.parentId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const visible = useMemo(() => {
    const query = normalize(q);
    const hit = query
      ? sets.filter((s) => normalize(`${s.title} ${s.description}`).includes(query))
      : sets;
    return sortSets(hit, sort, now);
  }, [sets, q, sort, now]);

  const totalCards = sets.reduce((n, s) => n + s.cards.length, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Library</h1>
          <p className="num">
            {sets.length} sets · {totalCards} cards
          </p>
        </div>
        <div className="head-actions">
          <button className="btn btn-secondary" onClick={() => openFolderDialog(null)}>
            <FolderPlus />
            New folder
          </button>
          <button className="btn btn-secondary" onClick={() => openAi(null)}>
            <Sparkles />
            AI import
          </button>
          <Link to="/sets/new" className="btn btn-primary">
            <Plus />
            New set
          </Link>
        </div>
      </div>

      {rootFolders.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 0 }}>
            <h2>Folders</h2>
          </div>
          <div className="grid-folders">
            {rootFolders.map((f) => (
              <FolderCard
                key={f.id}
                folder={f}
                sets={sets.filter((s) => s.folderId === f.id).length}
                sub={folders.filter((x) => x.parentId === f.id).length}
              />
            ))}
          </div>
        </>
      )}

      <div className="section-title">
        <h2>All sets</h2>
      </div>
      <div className="lib-tools">
        <label className="lib-search">
          <Search />
          <input
            className="input"
            placeholder="Filter sets"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <SortSelect value={sort} onChange={setSort} />
      </div>

      {sets.length === 0 ? (
        <Empty
          icon={<FileText />}
          title="No sets yet"
          action={
            <Link to="/sets/new" className="btn btn-primary">
              <Plus />
              Create your first set
            </Link>
          }
        >
          Type cards in, paste a list, or let AI write them for you.
        </Empty>
      ) : visible.length === 0 ? (
        <p className="muted">No sets match “{q}”.</p>
      ) : (
        <div className="grid-sets">
          {visible.map((s) => (
            <SetCard
              key={s.id}
              set={s}
              folder={s.folderId ? folderById.get(s.folderId) : undefined}
              now={now}
            />
          ))}
        </div>
      )}
    </div>
  );
}
