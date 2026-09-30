import { Cloud, LogOut, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "@/components/toast";
import { useNow } from "@/lib/hooks";
import { timeAgo } from "@/lib/time";
import { syncConfigured } from "@/sync/client";
import { signIn, signOut, signUp, syncNow } from "@/sync/engine";
import { useSync } from "@/sync/syncState";

export function SyncSection() {
  const { status, email, error, lastSyncedAt } = useSync();
  const now = useNow(15_000);
  const [mail, setMail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"in" | "up" | null>(null);
  const [message, setMessage] = useState("");

  if (!syncConfigured) {
    return (
      <p className="st-note">
        Cloud sync isn't configured for this build. Set <code>VITE_SUPABASE_URL</code> and{" "}
        <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (see README).
      </p>
    );
  }

  const signedIn = status !== "off" && !!email;

  if (signedIn) {
    const label =
      status === "syncing"
        ? "Syncing…"
        : status === "offline"
          ? "Offline — changes will sync when you're back online"
          : status === "error"
            ? `Sync failed: ${error}`
            : lastSyncedAt
              ? `Last synced ${timeAgo(lastSyncedAt, now)}`
              : "Waiting for first sync";
    return (
      <>
        <div className="st-row">
          <div className="st-row-text">
            <b>{email}</b>
            <small className={status === "error" ? "st-error" : undefined}>{label}</small>
          </div>
          <div className="st-row-ctl">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => syncNow()}
              disabled={status === "syncing"}
            >
              <RefreshCw className={status === "syncing" ? "spin" : undefined} />
              Sync now
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                await signOut();
                toast("Signed out — your data stays on this device");
              }}
            >
              <LogOut />
              Sign out
            </button>
          </div>
        </div>
        <p className="st-note">
          Sets, folders, progress, stats and settings sync automatically. API keys stay on each
          device.
        </p>
      </>
    );
  }

  const submit = async (mode: "in" | "up") => {
    if (!mail.trim() || password.length < 6) {
      setMessage("Enter your email and a password of at least 6 characters.");
      return;
    }
    setBusy(mode);
    setMessage("");
    try {
      if (mode === "in") {
        await signIn(mail, password);
        toast("Signed in — syncing");
      } else if (await signUp(mail, password)) {
        setMessage("Check your inbox and confirm your email, then sign in here.");
      } else {
        toast("Account created — syncing");
      }
      setPassword("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <form
      className="sync-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit("in");
      }}
    >
      <p className="st-note">
        <Cloud size={14} style={{ verticalAlign: -2 }} /> Sign in on each device to keep your
        library in sync. Everything still works offline.
      </p>
      <div className="sync-fields">
        <input
          className="input"
          type="email"
          autoComplete="email"
          placeholder="Email"
          value={mail}
          onChange={(e) => setMail(e.target.value)}
        />
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {message && <p className="st-note st-error">{message}</p>}
      <div className="st-actions">
        <button className="btn btn-primary btn-sm" type="submit" disabled={!!busy}>
          {busy === "in" && <span className="spinner" />}
          Sign in
        </button>
        <button
          className="btn btn-secondary btn-sm"
          type="button"
          disabled={!!busy}
          onClick={() => submit("up")}
        >
          {busy === "up" && <span className="spinner" />}
          Create account
        </button>
      </div>
    </form>
  );
}
