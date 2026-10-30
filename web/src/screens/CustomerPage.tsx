import { useState } from "react";
import { reminderLink } from "@shared/admin/commands/report.ts";
import { localPhone, naira } from "@shared/money.ts";
import { planAmount } from "@shared/progress.ts";
import { dayLabel, lagosDate, shortDate } from "@shared/time.ts";
import { undoPayment, updateCustomer } from "../api.ts";
import { useStore } from "../store.tsx";
import { CustomerForm } from "./CustomerForm.tsx";
import { go, Icon, Segments, StatusPill, TopBar } from "../ui.tsx";

export function CustomerPage({ id }: { id: number }) {
  const s = useStore();
  const row = s.rowById.get(id);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!row) {
    return (
      <>
        <TopBar title="Customer" fallback="/customers" />
        <p className="empty">This customer doesn't exist. <a href="#/customers">See all customers</a></p>
      </>
    );
  }
  const { customer: c, progress: p } = row;
  const history = s.payments.filter((x) => x.customer_id === id).reverse();

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await s.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const undo = (paymentId: number, amount: number, paidAt: string) => {
    if (!confirm(`Undo the ${naira(amount)} payment from ${shortDate(lagosDate(paidAt))}? ${c.name}'s total goes down to ${naira(p.total - amount)}.`)) return;
    run(() => undoPayment(paymentId));
  };
  const setActive = (active: boolean) => {
    if (!active && !confirm(`Remove ${c.name}? Their payments stay in your records and you can restore them later.`)) return;
    run(() => updateCustomer(id, { active }));
  };

  if (editing) {
    return (
      <>
        <TopBar title="Edit customer" fallback={`/customers/${id}`} />
        <CustomerForm
          customer={c}
          submitLabel="Save changes"
          onSubmit={async (v) => {
            await updateCustomer(id, { name: v.name, phone: v.phone, plan: v.plan });
            await s.reload();
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
        {c.active && (
          <button className="btn btn-danger-ghost btn-block" disabled={busy} onClick={() => setActive(false)}>
            Remove customer
          </button>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </>
    );
  }

  return (
    <>
      <TopBar
        title={c.name}
        fallback="/customers"
        action={<button className="icon-btn icon-btn-soft" onClick={() => setEditing(true)} aria-label="Edit customer"><Icon name="edit" /></button>}
      />

      {!c.active && (
        <div className="notice">
          <span>{c.name} was removed.</span>
          <button className="btn btn-ink btn-sm" disabled={busy} onClick={() => setActive(true)}>Restore</button>
        </div>
      )}

      <section className="hero-card">
        <div className="hero-top">
          <p className="eyebrow">Total paid</p>
          <span className="tag cap">{c.plan} · {naira(planAmount(s.settings, c.plan))}</span>
        </div>
        <span className="amount-xl">{naira(p.total)}</span>
        <Segments value={p.total} of={s.settings.target} dark />
        <p className="hero-sub">
          {p.left > 0
            ? `${naira(p.left)} left of the ${naira(s.settings.target)} target`
            : p.surplus > 0
            ? `Target reached, ${naira(p.surplus)} extra`
            : "Target reached"}
        </p>
        {c.active && (
          <div className="hero-actions">
            <button className="btn btn-white" onClick={() => go(`/pay/${id}`)}><Icon name="plus" /> Record payment</button>
            {p.behindBy > 0 && (
              <a className="btn btn-smoke" href={reminderLink(c, p.behindBy)} target="_blank" rel="noreferrer">
                <Icon name="chat" /> Remind
              </a>
            )}
          </div>
        )}
      </section>

      <dl className="facts">
        <div><dt>Status</dt><dd><StatusPill p={p} /></dd></div>
        <div><dt>Expected by now</dt><dd>{naira(p.expected)}</dd></div>
        <div>
          <dt>December</dt>
          <dd>{p.onTrack ? "On track" : `Not on track · ${naira(p.projected)} at this pace`}</dd>
        </div>
        <div><dt>Started</dt><dd>{dayLabel(c.start_date)}</dd></div>
        <div><dt>Phone</dt><dd><a href={`tel:${localPhone(c.phone)}`}>{localPhone(c.phone)}</a></dd></div>
      </dl>
      {error && <p className="error" role="alert">{error}</p>}

      <div className="section-head"><h2>History</h2></div>
      {history.length === 0
        ? <p className="empty">No payments yet.</p>
        : (
          <ul className="list">
            {history.map((x) => {
              const reversed = s.reversed.has(x.id);
              return (
                <li key={x.id} className="list-row">
                  <span className="list-main">
                    <span className="list-title">{dayLabel(lagosDate(x.paid_at))}</span>
                    <span className="list-sub">
                      {x.source === "undo" ? "Undo of an earlier payment" : reversed ? "Undone" : "Payment"}
                    </span>
                  </span>
                  <span className={`list-amount${x.amount < 0 ? " neg" : ""}${reversed ? " struck" : ""}`}>
                    {x.amount > 0 ? "+" : ""}{naira(x.amount)}
                  </span>
                  {x.source !== "undo" && !reversed && (
                    <button className="icon-btn icon-btn-soft icon-btn-sm" disabled={busy}
                      onClick={() => undo(x.id, x.amount, x.paid_at)} aria-label={`Undo ${naira(x.amount)} payment`}>
                      <Icon name="undo" size={16} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
    </>
  );
}
