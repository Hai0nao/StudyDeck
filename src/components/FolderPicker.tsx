import { useMemo } from "react";
import { useStore } from "@/store/useStore";
import type { Folder } from "@/store/types";

/** Folders flattened in tree order with their depth, for <select> pickers. */
function useFolderOptions(exclude?: string) {
  const folders = useStore((s) => s.folders);
  return useMemo(() => {
    const out: { id: string; label: string }[] = [];
    const walk = (parent: string | null, depth: number) => {
      folders
        .filter((f: Folder) => f.parentId === parent && f.id !== exclude)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((f) => {
          out.push({ id: f.id, label: `${" ".repeat(depth)}${f.name}` });
          walk(f.id, depth + 1);
        });
    };
    walk(null, 0);
    return out;
  }, [folders, exclude]);
}

export function FolderSelect({
  value,
  onChange,
  exclude,
  rootLabel = "No folder",
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  exclude?: string;
  rootLabel?: string;
}) {
  const options = useFolderOptions(exclude);
  return (
    <select
      className="select"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{rootLabel}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
