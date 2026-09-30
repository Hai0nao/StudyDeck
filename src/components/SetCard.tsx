import { Folder as FolderIcon } from "lucide-react";
import { Link } from "react-router";
import { dueCount, setMastery } from "@/store/useStore";
import type { Folder, StudySet } from "@/store/types";

export function MasteryBar({ set }: { set: StudySet }) {
  const m = setMastery(set);
  const pct = (n: number) => (m.total ? (n / m.total) * 100 : 0);
  return (
    <div className="stack" title={`${m.known} known · ${m.learning} learning · ${m.fresh} new`}>
      {m.known > 0 && <i className="s-known" style={{ width: `${pct(m.known)}%` }} />}
      {m.learning > 0 && <i className="s-learning" style={{ width: `${pct(m.learning)}%` }} />}
    </div>
  );
}

export function SetCard({ set, folder, now }: { set: StudySet; folder?: Folder; now: number }) {
  const due = dueCount(set, now);
  return (
    <Link to={`/sets/${set.id}`} className="set-card">
      <div className="set-card-top">
        <h3>{set.title || "Untitled set"}</h3>
        {due > 0 && <span className="badge accent num">{due} due</span>}
      </div>
      <p className="set-card-meta">
        <span className="num">{set.cards.length} cards</span>
        {folder && (
          <span className="set-card-folder">
            <FolderIcon />
            {folder.name}
          </span>
        )}
      </p>
      <MasteryBar set={set} />
    </Link>
  );
}

export function FolderCard({ folder, sets, sub }: { folder: Folder; sets: number; sub: number }) {
  return (
    <Link to={`/folders/${folder.id}`} className="folder-card">
      <FolderIcon />
      <div>
        <h3>{folder.name}</h3>
        <p className="num">
          {sets} {sets === 1 ? "set" : "sets"}
          {sub > 0 && ` · ${sub} ${sub === 1 ? "folder" : "folders"}`}
        </p>
      </div>
    </Link>
  );
}
