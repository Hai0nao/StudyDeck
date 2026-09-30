import { dueCount } from "@/store/useStore";
import type { Folder, StudySet } from "@/store/types";

export function folderPath(folders: Folder[], id: string | null): Folder[] {
  const out: Folder[] = [];
  let cur = folders.find((f) => f.id === id);
  while (cur && out.length < 50) {
    out.unshift(cur);
    cur = folders.find((f) => f.id === cur!.parentId);
  }
  return out;
}

export type SortKey = "recent" | "title" | "due" | "size";

export function sortSets(sets: StudySet[], key: SortKey, now: number) {
  const a = [...sets];
  switch (key) {
    case "title":
      return a.sort((x, y) => x.title.localeCompare(y.title));
    case "due":
      return a.sort((x, y) => dueCount(y, now) - dueCount(x, now));
    case "size":
      return a.sort((x, y) => y.cards.length - x.cards.length);
    default:
      return a.sort((x, y) => (y.studiedAt ?? y.updatedAt) - (x.studiedAt ?? x.updatedAt));
  }
}
