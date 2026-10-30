import { useState } from "react";
import { naira } from "@shared/money.ts";
import { parseAmount } from "@shared/parse/amount.ts";
import { planAmount } from "@shared/progress.ts";
import { dayLabel, lagosNoon } from "@shared/time.ts";
import type { IsoDate } from "@shared/types.ts";
import { addPayment, type Method, METHODS, undoPayment } from "../api.ts";
import { useStore } from "../store.tsx";
import { Avatar, go, Icon, TopBar } from "../ui.tsx";
import { Done } from "./Done.tsx";

export function RecordPayment({ customerId }: { customerId?: number }) {
  const s = useStore();
  const row = customerId ? s.rowById.get(customerId) : undefined;

  if (!row || !row.customer.active) return <PickCustomer />;
  return <PaymentForm key={row.customer.id} customerId={row.customer.id} />;
}

function PickCustomer() {
  const s = useStore();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = s.rows.filter((r) => !needle || r.customer.name.toLowerCase().includes(needle));

  return (
    <>
      <TopBar title="Record payment" />
      <h2 className="h-big">Who paid?</h2>
      <p className="lede">Pick the customer, then enter the amount.</p>
      <label className="search">
        <Icon name="search" size={18} />
        <input autoFocus placeholder="Search name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
      </label>
      {s.rows.length === 0
        ? <p className="empty">You have no customers yet. <a href="#/add">Add a customer</a> first.</p>
        : shown.length === 0
        ? <p className="empty">No customer matches “{q.trim()}”. <a href="#/add">Add them as a new customer</a></p>
        : (
          <ul className="list">
            {shown.map(({ customer: c, progress: p }) => (
              <li key={c.id}>
                <button className="list-row" onClick={() => go(`/pay/${c.id}`)}>
                  <Avatar name={c.name} />
                  <span className="list-main">
                    <span className="list-title">{c.name}</span>
                    <span className="list-sub"><span className="cap">{c.plan}</span> · {naira(planAmount(s.settings, c.plan))}</span>
                  </span>
                  <span className="list-end">
                    <span className="list-amount">{naira(p.total)}</span>
                    <span className="list-note">paid so far</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      <p className="hint footnote">
        Payments from before the app? <a href="#/old">Add old payments</a>
      </p>
    </>
  );
}

type Step = { kind: "form" } | { kind: "review"; amount: number } | { kind: "done"; amount: number; paymentId: number };

function PaymentForm({ customerId }: { customerId: number }) {
  const s = useStore();
  const { customer: c, progress: p } = s.rowById.get(customerId)!;
  const [amountText, setAmountText] = useState(String(planAmount(s.settings, c.plan)));
  const [date, setDate] = useState<IsoDate>(s.today);
  const [method, setMethod] = useState<Method>("cash");
  const [note, setNote] = useState("");
  const [step, setStep] = useState<Step>({ kind: "form" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const review = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseAmount(amountText);
    if (!amount) return setError("Enter the amount in naira, like 3500.");
    if (!date || date > s.today) return setError("The date can't be in the future.");
    setError(null);
    setStep({ kind: "review", amount });
  };

  const save = async (amount: number) => {
    setBusy(true);
    setError(null);
    try {
      const paidAt = date === s.today ? new Date().toISOString() : lagosNoon(date);
      const paymentId = await addPayment({ customerId: c.id, amount, paidAt, method, note });
      await s.reload();
      setStep({ kind: "done", amount, paymentId });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (step.kind === "done") {
    // `p` is already the reloaded total here.
    return (
      <Done
        title={`${naira(step.amount)} saved`}
        body={`${c.name} has now paid ${naira(p.total)}. ${p.left > 0 ? `${naira(p.left)} left to the target.` : "Target reached 🎉"}`}
        primary={{ label: "Record another payment", onClick: () => go("/pay") }}
        secondary={{ label: "Back to home", onClick: () => go("/") }}
        tertiary={{
          label: "Undo this payment",
          onClick: async () => {
            if (!confirm(`Undo the ${naira(step.amount)} payment for ${c.name}?`)) return;
            try {
              await undoPayment(step.paymentId);
              await s.reload();
              go(`/customers/${c.id}`);
            } catch (err) {
              alert((err as Error).message);
            }
          },
        }}
      />
    );
  }

  return (
    <>
      <TopBar title="Record payment" fallback="/pay" />
      <div className="who">
        <Avatar name={c.name} />
        <div>
          <p className="list-title">{c.name}</p>
          <p className="list-sub"><span className="cap">{c.plan}</span> plan · has paid {naira(p.total)}</p>
        </div>
        <a className="change" href="#/pay">Change</a>
      </div>

      {step.kind === "form"
        ? (
          <form className="stack" onSubmit={review}>
            <label className="amount-big">
              <span>Amount</span>
              <span className="amount-big-row">
                <b aria-hidden="true">₦</b>
                <input inputMode="numeric" value={amountText} onChange={(e) => setAmountText(e.target.value)}
                  style={{ width: `${Math.max(1, amountText.length) * 0.62 + 0.15}em` }} />
              </span>
              <small>Their {c.plan} amount is filled in. Change it if they paid more or less.</small>
            </label>
            <label className="field">
              <span>Date paid</span>
              <span className="input-icon">
                <Icon name="cal" size={18} />
                <input type="date" max={s.today} value={date} onChange={(e) => setDate(e.target.value)} />
              </span>
            </label>
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
            <label className="field">
              <span>Note <span className="hint-opt">(optional)</span></span>
              <span className="input-icon">
                <Icon name="note" size={18} />
                <input maxLength={120} placeholder="e.g. paid by her son" value={note} onChange={(e) => setNote(e.target.value)} />
              </span>
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn btn-ink btn-block">Continue</button>
          </form>
        )
        : (
          <div className="stack">
            <div>
              <h2 className="h-big">Check before saving</h2>
              <p className="lede">Make sure the amount and customer are right.</p>
            </div>
            <section className="review starry">
              <p className="eyebrow">Payment</p>
              <p className="review-amount">{naira(step.amount)}</p>
              <p>from <b>{c.name}</b> {date === s.today ? "today" : <>on <b>{dayLabel(date)}</b></>}</p>
              <div className="tags">
                <span className="tag">{METHODS.find((m) => m.value === method)?.label}</span>
                {note.trim() && <span className="tag">“{note.trim()}”</span>}
              </div>
              <span className="line" />
              <p className="total"><span>New total</span><b>{naira(p.total + step.amount)}</b></p>
            </section>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn btn-ink btn-block" disabled={busy} onClick={() => save(step.amount)}>
              {busy ? "Saving…" : <><Icon name="check" stroke={2.2} /> Save payment</>}
            </button>
            <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => setStep({ kind: "form" })}>
              Change it
            </button>
          </div>
        )}
    </>
  );
}
