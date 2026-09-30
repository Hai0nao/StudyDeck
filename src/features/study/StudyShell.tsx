import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { Progress } from "@/components/ui";
import "./study.css";

export function StudyShell({
  title,
  mode,
  exitTo,
  progress,
  right,
  children,
}: {
  title: string;
  mode: string;
  exitTo: string;
  progress?: number;
  right?: ReactNode;
  children: ReactNode;
}) {
  const nav = useNavigate();
  return (
    <div className="study">
      <header className="study-bar">
        <div className="study-title">
          <span className="study-mode">{mode}</span>
          <span className="study-set">{title}</span>
        </div>
        <div className="study-right">
          {right}
          <button className="icon-btn" onClick={() => nav(exitTo)} aria-label="Close">
            <X />
          </button>
        </div>
      </header>
      {progress !== undefined && (
        <div className="study-progress">
          <Progress value={progress} />
        </div>
      )}
      <div className="study-body">{children}</div>
    </div>
  );
}

export function Finish({
  icon,
  title,
  children,
  actions,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="finish">
      {icon && <div className="finish-icon">{icon}</div>}
      <h2>{title}</h2>
      {children}
      <div className="finish-actions">{actions}</div>
    </div>
  );
}
