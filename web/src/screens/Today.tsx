import { useState } from "react";
import { naira } from "@shared/money.ts";
import { dayLabel, lagosDate, weekStart } from "@shared/time.ts";
import type { Payment } from "@shared/types.ts";
import { METHODS } from "../api.ts";
import { type Store, useStore } from "../store.tsx";
import { Avatar, go, Icon, PageTitle } from "../ui.tsx";

const METHOD_TINT: Record<string, string> = { cash: "#d9eedf", transfer: "#dbe5f8", pos: "#e4ddf6", other: "#f3e8cf" };

type Range = "today" | "week" | "season";

/** Payments that still count from active customers, received in the range (by the date she says they paid). */
export function collectedIn(s: Store, range: Range): Payment[] {
  const from = range === "today" ? s.today : range === "week" ? weekStart(s.today) : "0000-01-01";
  return s.live.filter((p) => {
    if (!s.rowById.get(p.customer_id)?.customer.active) return false; // removed customers don't count
    const d = lagosDate(p.paid_at);
    return d >= from && d <= s.today;
  });
}

export const lagosTime = (iso: string) =>
  new Date(Date.parse(iso) + 3600_000).toISOString().slice(11, 16); // Lagos is UTC+1

export function Today() {
  const s = useStore();
  const [range, setRange] = useState<Range>("today");
  const list = collectedIn(s, range).slice().reverse();
  const total = list.reduce((t, p) => t + p.amount, 0);
  const byMethod = METHODS
    .map((m) => ({ ...m, sum: list.filter((p) => (p.method ?? "cash") === m.value).reduce((t, p) => t + p.amount, 0) }))
    .filter((m) => m.sum > 0);

  return (
    <>
      <PageTitle eyebrow={`Season ${s.season.name}`} title="Payments"
        action={<button className="icon-btn icon-btn-ink" onClick={() => go("/pay")} aria-label="Record payment"><Icon name="plus" /></button>} />
      <div className="chips" role="tablist">
        <button role="tab" aria-selected={range === "today"} className={`chip${range === "today" ? " on" : ""}`}
          onClick={() => setRange("today")}>Today</button>
        <button role="tab" aria-selected={range === "week"} className={`chip${range === "week" ? " on" : ""}`}
          onClick={() => setRange("week")}>This week</button>
        <button role="tab" aria-selected={range === "season"} className={`chip${range === "season" ? " on" : ""}`}
          onClick={() => setRange("season")}>All</button>
      </div>

      <section className="summary">
        <p className="muted">
          {range === "today"
            ? dayLabel(s.today)
            : range === "week"
            ? `Since ${dayLabel(weekStart(s.today))}`
            : `Since ${dayLabel(s.season.started_on)}`}
        </p>
        <p className="summary-amount">{naira(total)}</p>
        <p className="muted small-inline">
          {list.length} payment{list.length === 1 ? "" : "s"} from{" "}
          {new Set(list.map((p) => p.customer_id)).size} customer{new Set(list.map((p) => p.customer_id)).size === 1 ? "" : "s"}
        </p>
      </section>
      {byMethod.length > 0 && (
        <div className="stats">
          {byMethod.map((m) => (
            <div key={m.value} className="stat">
              <span className="icon-tile icon-tile-sm" style={{ background: METHOD_TINT[m.value] }}>
                <Icon name={m.value === "transfer" ? "bank" : m.value === "pos" ? "card" : "cash"} size={18} />
              </span>
              <span><b>{naira(m.sum)}</b><small>{m.label}</small></span>
            </div>
          ))}
        </div>
      )}
      {list.length > 0 && <div className="section-head"><h2>Payments</h2></div>}

      {list.length === 0
        ? <p className="empty">No payments recorded {range === "today" ? "today" : range === "week" ? "this week" : "this season"} yet.</p>
        : (
          <ul className="list">
            {list.map((p) => {
              const c = s.rowById.get(p.customer_id)?.customer;
              return (
                <li key={p.id}>
                  <a className="list-row" href={`#/payment/${p.id}`}>
                    <Avatar name={c?.name ?? "?"} />
                    <span className="list-main">
                      <span className="list-title">{c?.name ?? "Unknown"}</span>
                      <span className="list-sub">
                        {[
                          range === "today" ? lagosTime(p.paid_at) : dayLabel(lagosDate(p.paid_at)),
                          METHODS.find((m) => m.value === p.method)?.label,
                          p.note && `“${p.note}”`,
                        ].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="list-end"><span className="list-amount">+{naira(p.amount)}</span></span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
    </>
  );
}
