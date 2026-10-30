import { useEffect, useState } from "react";
import { naira } from "@shared/money.ts";
import type { Progress } from "@shared/progress.ts";
import { shortDate } from "@shared/time.ts";

// ───────────── routing: #/path, so the site works on any static host ─────────────

export function useRoute(): string {
  const read = () => location.hash.replace(/^#/, "") || "/";
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return route;
}

export const go = (path: string) => {
  location.hash = path;
};

export function back(fallback = "/") {
  if (history.length > 1) history.back();
  else go(fallback);
}

/** "20 Dec 2026" — for seasons, where the year matters. */
export function longDate(date: string): string {
  return `${shortDate(date)} ${date.slice(0, 4)}`;
}

// ───────────── pieces ─────────────

const PATHS: Record<string, string> = {
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14M13 6l6 6-6 6",
  users: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 19v-1a4 4 0 0 0-3-3.9M16 3.1a3.5 3.5 0 0 1 0 6.8",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  download: "M12 3v12M7 10l5 5 5-5M4 21h16",
  back: "M15 18l-6-6 6-6",
  chevron: "M9 6l6 6-6 6",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  eyeOff: "M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2",
  check: "M5 12.5l4.5 4.5L19 7.5",
  undo: "M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  edit: "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4",
  chat: "M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5",
  logout: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M21 21l-4.3-4.3",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1",
  gift: "M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7",
};

export function Icon({ name, size = 20 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function TopBar({ title, fallback = "/", action }: { title: string; fallback?: string; action?: React.ReactNode }) {
  return (
    <header className="topbar">
      <button className="icon-btn" onClick={() => back(fallback)} aria-label="Back"><Icon name="back" /></button>
      <h1 className="topbar-title">{title}</h1>
      <div className="topbar-action">{action}</div>
    </header>
  );
}

export function Avatar({ name, dim = false }: { name: string; dim?: boolean }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return <span className={`avatar${dim ? " avatar-dim" : ""}`} aria-hidden="true">{initials}</span>;
}

export function StatusPill({ p }: { p: Progress }) {
  if (p.left === 0) return <span className="pill pill-good">Target reached</span>;
  return p.behindBy > 0
    ? <span className="pill pill-bad">Behind {naira(p.behindBy)}</span>
    : <span className="pill pill-good">Up to date</span>;
}

/** Segmented bar: the card-chip gold fills one segment per 1/n of the way. */
export function Segments({ value, of, n = 24, dark = false }: { value: number; of: number; n?: number; dark?: boolean }) {
  const filled = of > 0 ? Math.min(n, Math.floor((value / of) * n)) : 0;
  return (
    <div className={`segments${dark ? " segments-dark" : ""}`} role="img"
      aria-label={`${of > 0 ? Math.min(100, Math.round((value / of) * 100)) : 0}% of target`}>
      {Array.from({ length: n }, (_, i) => <span key={i} className={i < filled ? "on" : ""} />)}
    </div>
  );
}
