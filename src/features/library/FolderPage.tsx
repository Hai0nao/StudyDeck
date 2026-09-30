import {
  ChevronRight,
  FileText,
  FolderInput,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { confirm } from "@/components/confirm";
import { FolderSelect } from "@/components/FolderPicker";
import { FolderCard, SetCard } from "@/components/SetCard";
import { toast } from "@/components/toast";
import { Empty, Menu, Modal } from "@/components/ui";
import { useNow } from "@/lib/hooks";
import { useStore } from "@/store/useStore";
import { openAi, openFolderDialog } from "@/store/ui";
import { folderPath, sortSets, type SortKey } from "@/lib/library";
import { SortSelect } from "./LibraryPage";
import "./library.css";

export function FolderPage() {
  const { id } = useParams();
  const folders = useStore((s) => s.folders);
  const sets = useStore((s) => s.sets);
  const deleteFolder = useStore((s) => s.deleteFolder);
  const moveFolder = useStore((s) => s.moveFolder);
  const nav = useNavigate();
  const now = useNow();
  const [sort, setSort] = useState<SortKey>("recent");
  const [moving, setMoving] = useState(false);
  const [moveTarget, setMoveTarget] = useState<string | null>(null);

  const folder = folders.find((f) => f.id === id);
  const path = useMemo(() => folderPath(folders, id ?? null), [folders, id]);
  const subfolders = folders
    .filter((f) => f.parentId === id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const inside = useMemo(
    () =>
      sortSets(
        sets.filter((s) => s.folderId === id),
        sort,
        now,
      ),
    [sets, id, sort, now],
  );

  if (!folder) return <Navigate to="/library" replace />;

  const remove = async () => {
    const ok = await confirm(
      `Delete “${folder.name}”?`,
      "Subfolders are deleted too. Sets inside are kept and moved up one level.",
    );
    if (!ok) return;
    deleteFolder(folder.id);
    toast("Folder deleted");
    nav(folder.parentId ? `/folders/${folder.parentId}` : "/library");
  };

  return (
    <div className="page">
      <nav className="crumbs">
        <Link to="/library">Library</Link>
        {path.slice(0, -1).map((f) => (
          <span key={f.id} style={{ display: "contents" }}>
            <ChevronRight />
            <Link to={`/folders/${f.id}`}>{f.name}</Link>
          </span>
        ))}
      </nav>
      <div className="page-head">
        <div>
          <h1>{folder.name}</h1>
          <p className="num">
            {inside.length} sets · {inside.reduce((n, s) => n + s.cards.length, 0)} cards
          </p>
        </div>
        <div className="head-actions">
          <button className="btn btn-secondary" onClick={() => openAi(folder.id)}>
            <Sparkles />
            AI import
          </button>
          <Link to={`/sets/new?folder=${folder.id}`} className="btn btn-primary">
            <Plus />
            New set
          </Link>
          <Menu
            trigger={(toggle) => (
              <button className="icon-btn" onClick={toggle} aria-label="Folder options">
                <MoreHorizontal />
              </button>
            )}
            items={[
              {
                label: "Rename",
                icon: <Pencil />,
                onClick: () => openFolderDialog(folder.parentId, folder.id),
              },
              {
                label: "New subfolder",
                icon: <FolderPlus />,
                onClick: () => openFolderDialog(folder.id),
              },
              {
                label: "Move to…",
                icon: <FolderInput />,
                onClick: () => {
                  setMoveTarget(folder.parentId);
                  setMoving(true);
                },
              },
              { label: "", onClick: () => {}, divider: true },
              { label: "Delete folder", icon: <Trash2 />, onClick: remove, danger: true },
            ]}
          />
        </div>
      </div>

      {subfolders.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 0 }}>
            <h2>Folders</h2>
          </div>
          <div className="grid-folders">
            {subfolders.map((f) => (
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

      <div className="section-title" style={subfolders.length ? undefined : { marginTop: 0 }}>
        <h2>Sets</h2>
        {inside.length > 1 && <SortSelect value={sort} onChange={setSort} />}
      </div>
      {inside.length ? (
        <div className="grid-sets">
          {inside.map((s) => (
            <SetCard key={s.id} set={s} now={now} />
          ))}
        </div>
      ) : (
        <Empty icon={<FileText />} title="This folder is empty">
          Create a set here, or move an existing set in from its menu.
        </Empty>
      )}

      {moving && (
        <Modal
          title={`Move “${folder.name}”`}
          onClose={() => setMoving(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setMoving(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  moveFolder(folder.id, moveTarget);
                  setMoving(false);
                  toast("Folder moved");
                }}
              >
                Move
              </button>
            </>
          }
        >
          <label className="field">
            <span>Destination</span>
            <FolderSelect
              value={moveTarget}
              onChange={setMoveTarget}
              exclude={folder.id}
              rootLabel="Library (top level)"
            />
          </label>
        </Modal>
      )}
    </div>
  );
}
