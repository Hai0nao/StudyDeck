import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { CommandPalette } from "./components/CommandPalette";
import { ConfirmHost } from "./components/confirm";
import { FolderDialogHost } from "./components/FolderDialog";
import { Layout } from "./components/Layout";
import { ReminderAgent } from "./components/ReminderAgent";
import { Toasts } from "./components/toast";
import { AiDialogHost } from "./features/ai/AiDialog";
import { EditorPage } from "./features/editor/EditorPage";
import { HomePage } from "./features/home/HomePage";
import { FolderPage } from "./features/library/FolderPage";
import { LibraryPage } from "./features/library/LibraryPage";
import { SetPage } from "./features/sets/SetPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { FlashcardsPage } from "./features/study/Flashcards";
import { LearnPage } from "./features/study/Learn";
import { MatchPage } from "./features/study/Match";
import { ReviewPage } from "./features/study/Review";
import { TestPage } from "./features/study/Test";
import { useStore } from "./store/useStore";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function AccentSync() {
  const accent = useStore((s) => s.settings.accent);
  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);
  return null;
}

export default function App() {
  return (
    <HashRouter>
      <ScrollToTop />
      <AccentSync />
      <ReminderAgent />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="folders/:id" element={<FolderPage />} />
          <Route path="sets/new" element={<EditorPage key="new" />} />
          <Route path="sets/:id" element={<SetPage />} />
          <Route path="sets/:id/edit" element={<EditorPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="sets/:id/flashcards" element={<FlashcardsPage />} />
        <Route path="sets/:id/learn" element={<LearnPage />} />
        <Route path="sets/:id/test" element={<TestPage />} />
        <Route path="sets/:id/match" element={<MatchPage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <CommandPalette />
      <AiDialogHost />
      <FolderDialogHost />
      <ConfirmHost />
      <Toasts />
    </HashRouter>
  );
}
