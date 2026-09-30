import { useState } from "react";
import { useNavigate } from "react-router";
import { useStore } from "@/store/useStore";
import { useUi } from "@/store/ui";
import { toast } from "./toast";
import { Modal } from "./ui";

export function FolderDialogHost() {
  const req = useUi((s) => s.folderDialog);
  if (!req) return null;
  return <FolderDialog key={req.editId ?? "new"} parentId={req.parentId} editId={req.editId} />;
}

function FolderDialog({ parentId, editId }: { parentId: string | null; editId?: string }) {
  const folders = useStore((s) => s.folders);
  const createFolder = useStore((s) => s.createFolder);
  const renameFolder = useStore((s) => s.renameFolder);
  const nav = useNavigate();
  const editing = folders.find((f) => f.id === editId);
  const [name, setName] = useState(editing?.name ?? "");
  const close = () => useUi.setState({ folderDialog: null });

  const save = () => {
    if (!name.trim()) return;
    if (editing) {
      renameFolder(editing.id, name);
      toast("Folder renamed");
    } else {
      const id = createFolder(name, parentId);
      toast("Folder created");
      nav(`/folders/${id}`);
    }
    close();
  };

  const parent = folders.find((f) => f.id === parentId);
  return (
    <Modal
      title={editing ? "Rename folder" : "New folder"}
      onClose={close}
      footer={
        <>
          <button className="btn btn-ghost" onClick={close}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!name.trim()}>
            {editing ? "Save" : "Create folder"}
          </button>
        </>
      }
    >
      <label className="field">
        <span>Name</span>
        <input
          className="input"
          autoFocus
          value={name}
          placeholder="e.g. IELTS vocabulary"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        {!editing && parent && <small>Inside “{parent.name}”</small>}
      </label>
    </Modal>
  );
}
