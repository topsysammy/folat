import { useState } from "react";
import { naira } from "@shared/money.ts";
import { type Row, useStore } from "../store.tsx";
import { Avatar, go, Icon, StatusPill, TopBar } from "../ui.tsx";

type Filter = "all" | "behind" | "removed";

export function Customers() {
  const s = useStore();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const pool: Row[] = filter === "removed"
    ? [...s.rowById.values()].filter((r) => !r.customer.active)
    : filter === "behind"
    ? s.rows.filter((r) => r.progress.behindBy > 0)
    : s.rows;
  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const shown = pool.filter((r) =>
    !needle || r.customer.name.toLowerCase().includes(needle) ||
    (digits.length >= 3 && `0${r.customer.phone.slice(3)}`.includes(digits))
  );

  return (
    <>
      <TopBar
        title="Customers"
        action={<button className="icon-btn icon-btn-soft" onClick={() => go("/add")} aria-label="Add customer"><Icon name="plus" /></button>}
      />
      <label className="search">
        <Icon name="search" size={18} />
        <input placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
      </label>
      <div className="chips" role="tablist">
        {(["all", "behind", "removed"] as Filter[]).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} className={`chip${filter === f ? " on" : ""}`}
            onClick={() => setFilter(f)}>
            {f === "all" ? `All · ${s.rows.length}` : f === "behind" ? "Behind" : "Removed"}
          </button>
        ))}
      </div>

      {shown.length === 0
        ? (
          <p className="empty">
            {needle ? `No customer matches “${q.trim()}”.` : filter === "behind"
              ? "Nobody is behind. Everyone is up to date."
              : filter === "removed"
              ? "No removed customers."
              : "No customers yet. Tap + to add your first one."}
          </p>
        )
        : (
          <ul className="list">
            {shown.map(({ customer: c, progress: p }) => (
              <li key={c.id}>
                <a className="list-row" href={`#/customers/${c.id}`}>
                  <Avatar name={c.name} dim={!c.active} />
                  <span className="list-main">
                    <span className="list-title">{c.name}</span>
                    <span className="list-sub">
                      <span className="cap">{c.plan}</span> · {c.active ? <StatusPill p={p} /> : "Removed"}
                    </span>
                  </span>
                  <span className="list-amount">{naira(p.total)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
    </>
  );
}
