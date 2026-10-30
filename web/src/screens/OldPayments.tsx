import { useState } from "react";
import { naira } from "@shared/money.ts";
import { parseAmount } from "@shared/parse/amount.ts";
import { planAmount } from "@shared/progress.ts";
import { addDays, dayLabel, isoDate, isValidDate, lagosDate, lagosNoon } from "@shared/time.ts";
import type { IsoDate, Plan } from "@shared/types.ts";
import { addPayments, type Method, METHODS } from "../api.ts";
import { useStore } from "../store.tsx";
import { Avatar, go, Icon, TopBar } from "../ui.tsx";
import { Done } from "./Done.tsx";

// Payments she took on WhatsApp before the app existed. She can type each one
// with its date, or one "brought forward" total per customer.

export function OldPayments({ customerId }: { customerId?: number }) {
  const s = useStore();
  const row = customerId ? s.rowById.get(customerId) : undefined;
  if (!row || !row.customer.active) return <PickCustomer />;
  return <OldPaymentsForm key={row.customer.id} customerId={row.customer.id} />;
}

function PickCustomer() {
  const s = useStore();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const count = new Map<number, number>();
  for (const p of s.live) count.set(p.customer_id, (count.get(p.customer_id) ?? 0) + 1);
  const shown = s.rows.filter((r) => !needle || r.customer.name.toLowerCase().includes(needle));

  return (
    <>
      <TopBar title="Old payments" />
      <p className="lede">
        Add payments customers made before the app, from her WhatsApp chats. Pick a customer, or{" "}
        <a href="#/add">add a new customer</a> first.
      </p>
      <label className="search">
        <Icon name="search" size={18} />
        <input placeholder="Search name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
      </label>
      {shown.length === 0
        ? <p className="empty">{s.rows.length ? `No customer matches “${q.trim()}”.` : "No customers yet."}</p>
        : (
          <ul className="list">
            {shown.map(({ customer: c, progress: p }) => (
              <li key={c.id}>
                <button className="list-row" onClick={() => go(`/old/${c.id}`)}>
                  <Avatar name={c.name} />
                  <span className="list-main">
                    <span className="list-title">{c.name}</span>
                    <span className="list-sub">
                      {count.get(c.id) ?? 0} payment{count.get(c.id) === 1 ? "" : "s"} · started {dayLabel(c.start_date)}
                    </span>
                  </span>
                  <span className="list-amount">{naira(p.total)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
    </>
  );
}

/** The next due date after `date` on this plan, never past today. */
function nextDue(plan: Plan, date: IsoDate, today: IsoDate): IsoDate {
  let next: IsoDate;
  if (plan === "daily") next = addDays(date, 1);
  else if (plan === "weekly") next = addDays(date, 7);
  else {
    const [y, m, d] = date.split("-").map(Number);
    const [ny, nm] = m === 12 ? [y + 1, 1] : [y, m + 1];
    let day = d;
    while (!isValidDate(ny, nm, day)) day--; // 31 Jan → 28/29 Feb
    next = isoDate(ny, nm, day);
  }
  return next > today ? today : next;
}

interface Line {
  key: number;
  date: IsoDate;
  amount: string;
}

type Mode = "each" | "total";

function OldPaymentsForm({ customerId }: { customerId: number }) {
  const s = useStore();
  const { customer: c, progress: p, lastPaid } = s.rowById.get(customerId)!;
  const amount = String(planAmount(s.settings, c.plan));
  const existing = s.live.filter((x) => x.customer_id === c.id);
  const firstDate = lastPaid ? nextDue(c.plan, lastPaid, s.today) : c.start_date;

  const [mode, setMode] = useState<Mode>("each");
  const [lines, setLines] = useState<Line[]>([{ key: 1, date: firstDate, amount }]);
  const [totalText, setTotalText] = useState("");
  const [lastDate, setLastDate] = useState<IsoDate>(addDays(s.today, -1) < c.start_date ? c.start_date : addDays(s.today, -1));
  const [method, setMethod] = useState<Method>("transfer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ count: number; sum: number } | null>(null);

  if (saved) {
    return (
      <Done
        title={`${naira(saved.sum)} added`}
        body={`${saved.count} old payment${saved.count === 1 ? "" : "s"} saved for ${c.name}. They have now paid ${naira(p.total)}.`}
        primary={{ label: "Next customer", onClick: () => go("/old") }}
        secondary={{ label: `Open ${c.name}`, onClick: () => go(`/customers/${c.id}`) }}
        tertiary={{ label: "Back to home", onClick: () => go("/") }}
      />
    );
  }

  const setLine = (key: number, patch: Partial<Line>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => {
    const last = lines.at(-1);
    const date = last ? nextDue(c.plan, last.date, s.today) : firstDate;
    setLines([...lines, { key: (last?.key ?? 0) + 1, date, amount: last?.amount ?? amount }]);
  };

  /** Checks one date; returns an error message or null. */
  const badDate = (date: IsoDate, label: string): string | null => {
    if (!date) return `${label}: pick a date.`;
    if (date > s.today) return `${label}: the date can't be in the future.`;
    if (date < c.start_date) {
      return `${label}: ${dayLabel(date)} is before ${c.name} started (${dayLabel(c.start_date)}). ` +
        "Change their start date on their page first.";
    }
    return null;
  };

  const save = async () => {
    setError(null);
    let rows: { amount: number; paidAt: string; method: Method; note: string }[];
    if (mode === "each") {
      rows = [];
      for (const [i, l] of lines.entries()) {
        const label = `Payment ${i + 1}`;
        const problem = badDate(l.date, label);
        if (problem) return setError(problem);
        const n = parseAmount(l.amount);
        if (!n) return setError(`${label}: enter the amount in naira, like 3500.`);
        rows.push({ amount: n, paidAt: lagosNoon(l.date), method, note: "From WhatsApp, before the app" });
      }
    } else {
      const n = parseAmount(totalText);
      if (!n) return setError("Enter the total they paid before the app, like 42000.");
      const problem = badDate(lastDate, "Last payment");
      if (problem) return setError(problem);
      rows = [{ amount: n, paidAt: lagosNoon(lastDate), method, note: "Brought forward: total paid before the app" }];
    }
    const sum = rows.reduce((t, r) => t + r.amount, 0);
    if (!confirm(`Add ${rows.length} old payment${rows.length === 1 ? "" : "s"} (${naira(sum)} in total) for ${c.name}?`)) return;

    setBusy(true);
    try {
      await addPayments(c.id, rows);
      await s.reload();
      setSaved({ count: rows.length, sum });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const sumLines = lines.reduce((t, l) => t + (parseAmount(l.amount) ?? 0), 0);

  return (
    <>
      <TopBar title="Old payments" fallback="/old" />
      <div className="who">
        <Avatar name={c.name} />
        <div>
          <p className="list-title">{c.name}</p>
          <p className="list-sub">
            <span className="cap">{c.plan}</span> · started {dayLabel(c.start_date)} ·{" "}
            <a href={`#/customers/${c.id}`}>change</a>
          </p>
        </div>
      </div>

      <div className="segmented segmented-2" role="radiogroup" aria-label="How to enter">
        <label className={mode === "each" ? "on" : ""}>
          <input type="radio" name="mode" checked={mode === "each"} onChange={() => setMode("each")} />
          Each payment
          <small>Type every payment with its date</small>
        </label>
        <label className={mode === "total" ? "on" : ""}>
          <input type="radio" name="mode" checked={mode === "total"} onChange={() => setMode("total")} />
          One total
          <small>Everything paid so far, in one amount</small>
        </label>
      </div>

      <div className="stack gap-top">
        {mode === "each"
          ? (
            <>
              <ul className="lines">
                {lines.map((l, i) => (
                  <li key={l.key}>
                    <span className="line-num">{i + 1}</span>
                    <input type="date" aria-label={`Payment ${i + 1} date`} min={c.start_date} max={s.today} value={l.date}
                      onChange={(e) => setLine(l.key, { date: e.target.value })} />
                    <div className="amount-input amount-input-sm">
                      <span aria-hidden="true">₦</span>
                      <input inputMode="numeric" aria-label={`Payment ${i + 1} amount`} value={l.amount}
                        onChange={(e) => setLine(l.key, { amount: e.target.value })} />
                    </div>
                    <button className="icon-btn icon-btn-sm" aria-label={`Remove payment ${i + 1}`} disabled={lines.length === 1}
                      onClick={() => setLines(lines.filter((x) => x.key !== l.key))}>
                      <Icon name="close" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
              <button className="btn btn-ghost btn-block" onClick={addLine}>
                <Icon name="plus" /> Add another payment
              </button>
              <p className="hint">Each new line moves to the next {c.plan === "daily" ? "day" : c.plan === "weekly" ? "week" : "month"}. Change any date or amount to match her chats.</p>
            </>
          )
          : (
            <>
              <label className="field">
                <span>Total paid before the app</span>
                <div className="amount-input">
                  <span aria-hidden="true">₦</span>
                  <input inputMode="numeric" placeholder="42000" value={totalText} onChange={(e) => setTotalText(e.target.value)} />
                </div>
              </label>
              <label className="field">
                <span>Date of their last payment</span>
                <input type="date" min={c.start_date} max={s.today} value={lastDate} onChange={(e) => setLastDate(e.target.value)} />
                <small className="hint">The total is saved on this date, so “stopped paying” stays correct.</small>
              </label>
            </>
          )}

        <fieldset className="field">
          <legend>How they paid</legend>
          <div className="chips chips-fill">
            {METHODS.map((m) => (
              <button type="button" key={m.value} className={`chip${method === m.value ? " on" : ""}`}
                aria-pressed={method === m.value} onClick={() => setMethod(m.value)}>
                {m.label}
              </button>
            ))}
          </div>
        </fieldset>

        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-ink btn-block" disabled={busy} onClick={save}>
          {busy
            ? "Saving…"
            : mode === "each"
            ? `Save ${lines.length} payment${lines.length === 1 ? "" : "s"} · ${naira(sumLines)}`
            : "Save total"}
        </button>
      </div>

      <div className="section-head"><h2>Already in the app</h2><span className="muted small-inline">{naira(p.total)}</span></div>
      {existing.length === 0
        ? <p className="empty">Nothing recorded for {c.name} yet.</p>
        : (
          <ul className="list">
            {existing.slice().reverse().map((x) => (
              <li key={x.id}>
                <a className="list-row" href={`#/payment/${x.id}`}>
                <span className="list-main">
                  <span className="list-title">{dayLabel(lagosDate(x.paid_at))}</span>
                  {x.note && <span className="list-sub">{x.note}</span>}
                </span>
                <span className="list-amount">+{naira(x.amount)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
    </>
  );
}
