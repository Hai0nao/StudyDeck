import { Cloud, CloudAlert, CloudCheck, CloudOff, RefreshCw } from "lucide-react";
import { Link } from "react-router";
import { useNow } from "@/lib/hooks";
import { timeAgo } from "@/lib/time";
import { syncConfigured } from "@/sync/client";
import { useSync } from "@/sync/syncState";

/** Small status line in the sidebar; links to the sync settings. */
export function SyncIndicator() {
  const { status, lastSyncedAt, email } = useSync();
  const now = useNow(30_000);
  if (!syncConfigured) return null;

  const signedIn = status !== "off" && !!email;
  const [icon, label] = !signedIn
    ? [<Cloud key="i" />, "Sign in to sync"]
    : status === "syncing"
      ? [<RefreshCw key="i" className="spin" />, "Syncing…"]
      : status === "offline"
        ? [<CloudOff key="i" />, "Offline"]
        : status === "error"
          ? [<CloudAlert key="i" />, "Sync failed"]
          : [
              <CloudCheck key="i" />,
              lastSyncedAt ? `Synced ${timeAgo(lastSyncedAt, now)}` : "Synced",
            ];

  return (
    <Link to="/settings#sync" className={`sync-ind ${signedIn ? status : "off"}`}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}
