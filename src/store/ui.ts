import { create } from "zustand";

interface UiState {
  /** AI import dialog: `folderId` is where a new set lands. */
  ai: { folderId: string | null } | null;
  palette: boolean;
  folderDialog: { parentId: string | null; editId?: string } | null;
}

export const useUi = create<UiState>(() => ({ ai: null, palette: false, folderDialog: null }));

export const openAi = (folderId: string | null = null) => useUi.setState({ ai: { folderId } });
export const openPalette = () => useUi.setState({ palette: true });
export const openFolderDialog = (parentId: string | null, editId?: string) =>
  useUi.setState({ folderDialog: { parentId, editId } });
