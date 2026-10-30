import { useState } from "react";
import { naira } from "@shared/money.ts";
import { daysBetween, lagosDate, shortDate } from "@shared/time.ts";
import { markCollected, untickCollected } from "../api.ts";
import { type Row, useStore } from "../store.tsx";
import { Avatar, Icon, longDate, Segments, TopBar } from "../ui.tsx";

type Tab = "waiting" | "collected";

export function Distribution() {
  const s = useStore();
  const [tab, setTab] = useState<Tab>("waiting");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(null); // customer whose "mark collected" form is open
  const [items, setItems] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savers = s.rows.filter((r) => r.progress.total > 0);
  const waiting = savers.filter((r) => !s.distByCustomer.has(r.customer.id));
  const handedOut = s.distributions.reduce((t, d) => t + d.amount_saved, 0);
  const daysLeft = daysBetween(s.today, s.settings.distribution_date);
  const needle = q.trim().toLowerCase();
  const match = (name: string) => !needle || name.toLowerCase().includes(needle);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await s.reload();
      setOpen(null);
      setItems("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const collect = (r: Row) =>
    run(() =>
      markCollected({ seasonId: s.season.id, customerId: r.customer.id, amountSaved: r.progress.total, items })
    );

  return (
    <>
      <TopBar title="Distribution" />
      <section className="hero-card">
        <div className="hero-top">
          <p className="eyebrow">Collected their food</p>
          <span className="tag">
            {daysLeft > 0 ? `${longDate(s.settings.distribution_date)} · in ${daysLeft} days` : longDate(s.settings.distribution_date)}
          </span>
        </div>
        <span className="amount-xl">{s.distributions.length} of {savers.length}</span>
        <Segments value={s.distributions.length} of={savers.length} dark />
        <p className="hero-sub">{naira(handedOut)} of savings handed out · {waiting.length} still to come</p>
      </section>

      <div className="chips gap-top" role="tablist">
        <button role="tab" aria-selected={tab === "waiting"} className={`chip${tab === "waiting" ? " on" : ""}`}
          onClick={() => setTab("waiting")}>Waiting · {waiting.length}</button>
        <button role="tab" aria-selected={tab === "collected"} className={`chip${tab === "collected" ? " on" : ""}`}
          onClick={() => setTab("collected")}>Collected · {s.distributions.length}</button>
      </div>
      <label className="search">
        <Icon name="search" size={18} />
        <input placeholder="Search name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
      </label>
      {error && <p className="error" role="alert">{error}</p>}

      {tab === "waiting"
        ? (
          waiting.length === 0
            ? <p className="empty">{savers.length ? "Everyone who saved has collected 🎉" : "No one has saved anything yet."}</p>
            : (
              <ul className="list">
                {waiting.filter((r) => match(r.customer.name)).map((r) => (
                  <li key={r.customer.id} className="dist-item">
                    <div className="list-row">
                      <Avatar name={r.customer.name} />
                      <span className="list-main">
                        <span className="list-title">{r.customer.name}</span>
                        <span className="list-sub">
                          Saved {naira(r.progress.total)}
                          {r.progress.left > 0 && ` · ${naira(r.progress.left)} short of target`}
                        </span>
                      </span>
                      {open !== r.customer.id && (
                        <button className="btn btn-ink btn-sm" onClick={() => {
                          setOpen(r.customer.id);
                          setItems("");
                        }}>
                          <Icon name="check" size={16} /> Collected
                        </button>
                      )}
                    </div>
                    {open === r.customer.id && (
                      <div className="dist-form">
                        <label className="field">
                          <span>What they received <small className="hint">(optional)</small></span>
                          <input autoFocus maxLength={160} placeholder="e.g. 1 bag rice, 2 tins oil, 1 carton noodles"
                            value={items} onChange={(e) => setItems(e.target.value)} />
                        </label>
                        <div className="row-2">
                          <button className="btn btn-ghost" disabled={busy} onClick={() => setOpen(null)}>Cancel</button>
                          <button className="btn btn-ink" disabled={busy} onClick={() => collect(r)}>
                            {busy ? "Saving…" : "Mark collected"}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )
        )
        : (
          s.distributions.length === 0
            ? <p className="empty">No one has collected yet. Tick people off on the Waiting tab as they collect.</p>
            : (
              <ul className="list">
                {s.distributions.slice().reverse()
                  .filter((d) => match(s.rowById.get(d.customer_id)?.customer.name ?? ""))
                  .map((d) => {
                    const name = s.rowById.get(d.customer_id)?.customer.name ?? "Unknown";
                    return (
                      <li key={d.id} className="list-row">
                        <Avatar name={name} />
                        <span className="list-main">
                          <span className="list-title">{name}</span>
                          <span className="list-sub">
                            {naira(d.amount_saved)} · {shortDate(lagosDate(d.collected_at))}
                            {d.items && ` · ${d.items}`}
                          </span>
                        </span>
                        <button className="icon-btn icon-btn-soft icon-btn-sm" disabled={busy}
                          aria-label={`Undo: ${name} has not collected`}
                          onClick={() => {
                            if (confirm(`Mark ${name} as not collected yet?`)) run(() => untickCollected(d.id));
                          }}>
                          <Icon name="undo" size={16} />
                        </button>
                      </li>
                    );
                  })}
              </ul>
            )
        )}
    </>
  );
}
