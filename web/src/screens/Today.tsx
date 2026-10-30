import { useState } from "react";
import { naira } from "@shared/money.ts";
import { dayLabel, lagosDate, weekStart } from "@shared/time.ts";
import type { Payment } from "@shared/types.ts";
import { METHODS } from "../api.ts";
import { type Store, useStore } from "../store.tsx";
import { Avatar, TopBar } from "../ui.tsx";

type Range = "today" | "week";

/** Payments that still count, received in the range (by the date she says they paid). */
export function collectedIn(s: Store, range: Range): Payment[] {
  const from = range === "today" ? s.today : weekStart(s.today);
  return s.live.filter((p) => {
    const d = lagosDate(p.paid_at);
    return d >= from && d <= s.today;
  });
}

const lagosTime = (iso: string) =>
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
      <TopBar title="Collections" />
      <div className="chips" role="tablist">
        <button role="tab" aria-selected={range === "today"} className={`chip${range === "today" ? " on" : ""}`}
          onClick={() => setRange("today")}>Today</button>
        <button role="tab" aria-selected={range === "week"} className={`chip${range === "week" ? " on" : ""}`}
          onClick={() => setRange("week")}>This week</button>
      </div>

      <section className="summary">
        <p className="eyebrow-dark">{range === "today" ? dayLabel(s.today) : `Since ${dayLabel(weekStart(s.today))}`}</p>
        <p className="summary-amount">{naira(total)}</p>
        <p className="muted">
          {list.length} payment{list.length === 1 ? "" : "s"} from{" "}
          {new Set(list.map((p) => p.customer_id)).size} customer{new Set(list.map((p) => p.customer_id)).size === 1 ? "" : "s"}
        </p>
        {byMethod.length > 0 && (
          <div className="split">
            {byMethod.map((m) => <span key={m.value}><b>{naira(m.sum)}</b> {m.label.toLowerCase()}</span>)}
          </div>
        )}
      </section>

      {list.length === 0
        ? <p className="empty">No payments recorded {range === "today" ? "today" : "this week"} yet.</p>
        : (
          <ul className="list">
            {list.map((p) => {
              const c = s.rowById.get(p.customer_id)?.customer;
              return (
                <li key={p.id}>
                  <a className="list-row" href={`#/customers/${p.customer_id}`}>
                    <Avatar name={c?.name ?? "?"} />
                    <span className="list-main">
                      <span className="list-title">{c?.name ?? "Unknown"}</span>
                      <span className="list-sub">
                        {[
                          range === "week" ? dayLabel(lagosDate(p.paid_at)) : lagosTime(p.paid_at),
                          METHODS.find((m) => m.value === p.method)?.label,
                          p.note && `“${p.note}”`,
                        ].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="list-amount">+{naira(p.amount)}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
    </>
  );
}
