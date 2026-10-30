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
  close: "M6 6l12 12M18 6L6 18",
  trash: "M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1",
  gift: "M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7",
  home: "M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2",
  cal: "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M16 2v4M8 2v4M3 10h18",
  note: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8",
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z",
  refresh: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M22 7l-10 6L2 7",
  lock: "M6 11h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2M8 11V7a4 4 0 0 1 8 0v4",
  archive: "M3 3h18a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4",
  up: "M7 17L17 7M8 7h9v9",
  down: "M6 9l6 6 6-6",
  card: "M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2M2 10h20",
  bank: "M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3",
  cash: "M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M6 12h.01M18 12h.01",
  leaf: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2",
};

export function Icon({ name, size = 20, stroke = 1.9 }: { name: keyof typeof PATHS; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function TopBar({ title, fallback = "/", action }: { title: string; fallback?: string; action?: React.ReactNode }) {
  return (
    <header className="topbar">
      <button className="icon-btn icon-btn-soft" onClick={() => back(fallback)} aria-label="Back"><Icon name="back" /></button>
      <h1 className="topbar-title">{title}</h1>
      <div className="topbar-action">{action}</div>
    </header>
  );
}

/** Big title for the screens on the tab bar. */
export function PageTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <header className="page-title">
      <div>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {action}
    </header>
  );
}

// Each customer keeps the same soft colour everywhere.
const TINTS = ["#f3e8cf", "#e4ddf6", "#dbe5f8", "#d9eedf", "#f8dfe0", "#ece6dc", "#fbe3d2", "#d8eef3"];

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export function tint(name: string): string {
  let h = 0;
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

export function Avatar({ name, dim = false, size }: { name: string; dim?: boolean; size?: "sm" | "lg" }) {
  return (
    <span className={`avatar${size ? ` avatar-${size}` : ""}${dim ? " avatar-dim" : ""}`} style={{ background: tint(name) }}
      aria-hidden="true">
      {initials(name)}
    </span>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** White square with the day and month, for payment history. */
export function DateTile({ date }: { date: string }) {
  return (
    <span className="date-tile" aria-hidden="true">
      <b>{date.slice(8, 10)}</b>
      <small>{MONTHS[Number(date.slice(5, 7)) - 1]}</small>
    </span>
  );
}

/** Red "Behind ₦…" or green "Up to date", as text; `pill` puts it on a tinted background. */
export function StatusPill({ p, pill = false }: { p: Progress; pill?: boolean }) {
  const bad = p.left > 0 && p.behindBy > 0;
  const label = p.left === 0 ? "Target reached" : bad ? `Behind ${naira(p.behindBy)}` : "Up to date";
  return (
    <span className={pill ? `pill ${bad ? "pill-bad" : "pill-good"}` : `status ${bad ? "status-bad" : "status-good"}`}>
      {bad ? <Icon name="clock" size={13} stroke={2.2} /> : <span className="status-dot" />}
      {label}
    </span>
  );
}

const TABS = [
  { path: "/", label: "Home", icon: "home" },
  { path: "/customers", label: "Customers", icon: "users" },
  { path: "/today", label: "Payments", icon: "cash" },
  { path: "/settings", label: "Settings", icon: "gear" },
] as const;

/** The section a route belongs to, if it's one of the tab bar's own screens. */
export function tabFor(route: string): string | null {
  if (route === "/" || route === "") return "/";
  if (route === "/customers" || route === "/settings") return route;
  if (route === "/today") return "/today";
  return null;
}

export function TabBar({ active }: { active: string }) {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <a key={t.path} href={`#${t.path}`} className={active === t.path ? "on" : ""}
          aria-current={active === t.path ? "page" : undefined}>
          <Icon name={t.icon} size={22} />
          {t.label}
        </a>
      ))}
    </nav>
  );
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
