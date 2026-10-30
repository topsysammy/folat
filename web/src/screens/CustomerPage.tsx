import { useState } from "react";
import { reminderLink } from "@shared/admin/commands/report.ts";
import { localPhone, naira } from "@shared/money.ts";
import { planAmount } from "@shared/progress.ts";
import { dayLabel, lagosDate, shortDate } from "@shared/time.ts";
import { METHODS, undoPayment, updateCustomer } from "../api.ts";
import { statementLink } from "../messages.ts";
import { useStore } from "../store.tsx";
import { CustomerForm } from "./CustomerForm.tsx";
import { Avatar, DateTile, go, Icon, Segments, StatusPill, TopBar } from "../ui.tsx";

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
  const lastPayment = s.live.filter((x) => x.customer_id === id).sort((a, b) => a.paid_at.localeCompare(b.paid_at)).at(-1);

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
          withStart
          submitLabel="Save changes"
          onSubmit={async (v) => {
            await updateCustomer(id, { name: v.name, phone: v.phone, plan: v.plan, start_date: v.start_date });
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
        title="Customer"
        fallback="/customers"
        action={<button className="icon-btn icon-btn-soft" onClick={() => setEditing(true)} aria-label="Edit customer"><Icon name="edit" size={19} /></button>}
      />

      {!c.active && (
        <div className="notice">
          <span>{c.name} was removed.</span>
          <button className="btn btn-ink btn-sm" disabled={busy} onClick={() => setActive(true)}>Restore</button>
        </div>
      )}

      <div className="who-big">
        <Avatar name={c.name} size="lg" dim={!c.active} />
        <div>
          <p className="who-name">{c.name}</p>
          <p className="muted"><span className="cap">{c.plan}</span> plan · {naira(planAmount(s.settings, c.plan))} a {c.plan === "daily" ? "day" : c.plan === "weekly" ? "week" : "month"}</p>
        </div>
        <a className="icon-btn icon-btn-soft" href={`tel:${localPhone(c.phone)}`} aria-label={`Call ${c.name}`}><Icon name="phone" size={19} /></a>
      </div>

      <section className="balance">
        <p className="balance-label">Total paid</p>
        <div className="balance-amount"><b>{naira(p.total)}</b></div>
        {p.left > 0 && p.behindBy > 0 && (
          <p className="small-inline">
            <span className="status status-bad"><Icon name="clock" size={15} stroke={2.2} /> Behind {naira(p.behindBy)}</span>
            <span className="muted"> · expected {naira(p.expected)} by now</span>
          </p>
        )}
        <div className="balance-foot">
          <Segments value={p.total} of={s.settings.target} />
          <p>
            {p.left > 0
              ? `${naira(p.left)} left of the ${naira(s.settings.target)} target`
              : p.surplus > 0
              ? `Target reached, ${naira(p.surplus)} extra`
              : "Target reached"}
          </p>
        </div>
      </section>

      {c.active && (
        <div className="actions gap-top">
          <button className="btn btn-ink" onClick={() => go(`/pay/${id}`)}><Icon name="plus" stroke={2.2} /> Record payment</button>
          {p.behindBy > 0 && (
            <a className="btn btn-ghost" href={reminderLink(c, p.behindBy)} target="_blank" rel="noreferrer">
              <Icon name="chat" /> Remind
            </a>
          )}
        </div>
      )}

      <dl className="facts">
        <div><dt>Status</dt><dd><StatusPill p={p} pill /></dd></div>
        <div><dt>Expected by now</dt><dd>{naira(p.expected)}</dd></div>
        <div>
          <dt>December</dt>
          <dd>
            {p.onTrack
              ? <span className="green">On track</span>
              : <><span className="red">Not on track</span><small>{naira(p.projected)} at this pace</small></>}
          </dd>
        </div>
        <div><dt>Started</dt><dd>{dayLabel(c.start_date)}</dd></div>
        <div><dt>Phone</dt><dd><a href={`tel:${localPhone(c.phone)}`}>{localPhone(c.phone)}</a></dd></div>
      </dl>
      <a className="btn btn-ghost btn-block share" href={statementLink(row, s.settings.target, lastPayment)}
        target="_blank" rel="noreferrer">
        <Icon name="chat" /> Send statement on WhatsApp
      </a>
      {error && <p className="error gap-top" role="alert">{error}</p>}

      <div className="section-head">
        <h2>History</h2>
        {c.active && <a className="strong" href={`#/old/${id}`}>+ Old payments</a>}
      </div>
      {history.length === 0
        ? <p className="empty">No payments yet.</p>
        : (
          <ul className="list">
            {history.map((x) => {
              const reversed = s.reversed.has(x.id);
              return (
                <li key={x.id} className="list-row">
                  <a className="list-link" href={`#/payment/${x.id}`}>
                  <DateTile date={lagosDate(x.paid_at)} />
                  <span className="list-main">
                    <span className="list-title">{dayLabel(lagosDate(x.paid_at))}</span>
                    <span className="list-sub">
                      {x.source === "undo"
                        ? "Undo of an earlier payment"
                        : [
                          reversed ? "Undone" : "Payment",
                          METHODS.find((m) => m.value === x.method)?.label,
                          x.note && `“${x.note}”`,
                        ].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className={`list-amount${x.amount < 0 ? " neg" : ""}${reversed ? " struck" : ""}`}>
                    {x.amount > 0 ? "+" : ""}{naira(x.amount)}
                  </span>
                  </a>
                  {x.source !== "undo" && !reversed && (
                    <button className="icon-btn icon-btn-white icon-btn-sm" disabled={busy}
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
