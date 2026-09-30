import { makeCard, makeSet } from "@/store/defaults";
import type { AppData, Card, DayStat, Folder, StudySet } from "@/store/types";
import { uid } from "./id";
import { fromLegacy } from "./srs";

export const BACKUP_VERSION = 3;

export interface Backup extends AppData {
  app: "studydeck";
  version: number;
  exportedAt: string;
}

export function makeBackup(data: AppData): Backup {
  return {
    app: "studydeck",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    sets: data.sets,
    folders: data.folders,
    days: data.days,
  };
}

/* ---------- StudyDeck 2 (single-file app) ---------- */

interface LegacyTerm {
  id?: string;
  term?: string;
  def?: string;
  m?: number;
  star?: boolean;
  srs?: { lvl?: number; added?: number; due?: number };
  hist?: { seen?: number; ok?: number; bad?: number };
}
interface LegacySet {
  id?: string;
  title?: string;
  desc?: string;
  folder?: string | null;
  terms?: LegacyTerm[];
  created?: number;
  updated?: number;
}
interface LegacyFolder {
  id?: string;
  name?: string;
  parent?: string | null;
  created?: number;
}
interface LegacyData {
  sets?: LegacySet[];
  folders?: LegacyFolder[];
  stats?: { days?: Record<string, { n?: number; ok?: number }> };
}

export function convertLegacy(raw: LegacyData, now = Date.now()): AppData {
  const folders: Folder[] = (raw.folders ?? []).map((f) => ({
    id: f.id || uid(),
    name: f.name || "Folder",
    parentId: f.parent ?? null,
    createdAt: f.created ?? now,
    modifiedAt: now,
  }));
  const folderIds = new Set(folders.map((f) => f.id));
  for (const f of folders) if (f.parentId && !folderIds.has(f.parentId)) f.parentId = null;

  const sets: StudySet[] = (raw.sets ?? []).map((s) =>
    makeSet({
      id: s.id || uid(),
      title: s.title || "Untitled set",
      description: s.desc || "",
      folderId: s.folder && folderIds.has(s.folder) ? s.folder : null,
      createdAt: s.created ?? now,
      updatedAt: s.updated ?? s.created ?? now,
      cards: (s.terms ?? []).map((t): Card => ({
        ...makeCard(t.term ?? "", t.def ?? "", t.srs?.added ?? now),
        id: t.id || uid(),
        star: !!t.star,
        learn: Math.max(0, Math.min(2, t.m ?? 0)) as Card["learn"],
        srs: fromLegacy(t.srs, now),
        seen: t.hist?.seen ?? 0,
        correct: t.hist?.ok ?? 0,
        wrong: t.hist?.bad ?? 0,
      })),
    }),
  );

  const days: Record<string, DayStat> = {};
  for (const [k, v] of Object.entries(raw.stats?.days ?? {})) {
    days[k] = { answers: v.n ?? 0, correct: v.ok ?? 0, newCards: 0 };
  }
  return { sets, folders, days };
}

/** Read StudyDeck 2 data left in this browser's localStorage (same origin only). */
export function readLegacyLocalStorage(): AppData | null {
  try {
    const sets = localStorage.getItem("sd.sets");
    if (!sets) return null;
    return convertLegacy({
      sets: JSON.parse(sets),
      folders: JSON.parse(localStorage.getItem("sd.folders") ?? "[]"),
      stats: JSON.parse(localStorage.getItem("sd.stats") ?? "{}"),
    });
  } catch {
    return null;
  }
}

/** Fill fields added after the data was written (e.g. modifiedAt from before cloud sync). */
export function normalizeData(data: AppData): AppData {
  return {
    days: data.days ?? {},
    folders: data.folders.map((f) => ({ ...f, modifiedAt: f.modifiedAt ?? f.createdAt ?? 0 })),
    sets: data.sets.map((s) => ({
      ...s,
      modifiedAt: s.modifiedAt ?? s.updatedAt ?? 0,
      cards: s.cards.map((c) => ({ ...c, modifiedAt: c.modifiedAt ?? c.createdAt ?? 0 })),
    })),
  };
}

/** Accept a StudyDeck 3 backup or a StudyDeck 2 "studydeck-backup.json". */
export function parseBackup(json: string): AppData {
  const data = JSON.parse(json);
  if (!data || typeof data !== "object") throw new Error("This file is not a StudyDeck backup.");
  if (data.app === "studydeck" && Array.isArray(data.sets)) {
    return normalizeData({ sets: data.sets, folders: data.folders ?? [], days: data.days ?? {} });
  }
  if (Array.isArray(data.sets)) return convertLegacy(data);
  throw new Error("This file is not a StudyDeck backup.");
}

/** Add incoming sets/folders without overwriting existing ones (ids that clash get new ids). */
export function mergeData(base: AppData, incoming: AppData): AppData {
  const folderIds = new Set(base.folders.map((f) => f.id));
  const setIds = new Set(base.sets.map((s) => s.id));
  const remap = new Map<string, string>();
  const folders = incoming.folders.map((f) => {
    if (!folderIds.has(f.id)) return f;
    const id = uid();
    remap.set(f.id, id);
    return { ...f, id };
  });
  const fixFolder = (id: string | null) => (id ? (remap.get(id) ?? id) : null);
  return {
    folders: [...base.folders, ...folders.map((f) => ({ ...f, parentId: fixFolder(f.parentId) }))],
    sets: [
      ...base.sets,
      ...incoming.sets.map((s) => ({
        ...s,
        id: setIds.has(s.id) ? uid() : s.id,
        folderId: fixFolder(s.folderId),
      })),
    ],
    days: { ...incoming.days, ...base.days },
  };
}

export function downloadFile(name: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
