import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { uid } from "@/lib/id";

export type SyncStatus = "off" | "idle" | "syncing" | "error" | "offline";

interface SyncState {
  /** identifies this browser's daily stats among the user's devices */
  deviceId: string;
  userId: string | null;
  email: string | null;
  /** server time of the newest row pulled so far */
  cursor: string | null;
  /** client time of the last successful upload (0 = never for this user) */
  lastPushAt: number;
  lastSyncedAt: number | null;
  status: SyncStatus;
  error: string | null;
}

export const useSync = create<SyncState>()(
  persist(
    (): SyncState => ({
      deviceId: uid(),
      userId: null,
      email: null,
      cursor: null,
      lastPushAt: 0,
      lastSyncedAt: null,
      status: "off",
      error: null,
    }),
    {
      name: "studydeck.sync",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        deviceId: s.deviceId,
        userId: s.userId,
        email: s.email,
        cursor: s.cursor,
        lastPushAt: s.lastPushAt,
        lastSyncedAt: s.lastSyncedAt,
      }),
    },
  ),
);
