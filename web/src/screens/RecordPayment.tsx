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
      <p className="lede">Who paid?</p>
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
                  <span className="list-amount">{naira(p.total)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
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
      </div>

      {step.kind === "form"
        ? (
          <form className="stack" onSubmit={review}>
            <label className="field">
              <span>Amount</span>
              <div className="amount-input">
                <span aria-hidden="true">₦</span>
                <input inputMode="numeric" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
              </div>
            </label>
            <label className="field">
              <span>Date paid</span>
              <input type="date" max={s.today} value={date} onChange={(e) => setDate(e.target.value)} />
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
              <span>Note <small className="hint">(optional)</small></span>
              <input maxLength={120} placeholder="e.g. paid by her son" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn btn-ink btn-block">Continue</button>
          </form>
        )
        : (
          <div className="stack">
            <section className="review">
              <p className="eyebrow">Check before saving</p>
              <p className="review-amount">{naira(step.amount)}</p>
              <p>from <b>{c.name}</b> on <b>{date === s.today ? "today" : dayLabel(date)}</b></p>
              <p className="muted">
                {METHODS.find((m) => m.value === method)?.label}
                {note.trim() && <> · “{note.trim()}”</>}
              </p>
              <p className="muted">New total: {naira(p.total + step.amount)}</p>
            </section>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn btn-ink btn-block" disabled={busy} onClick={() => save(step.amount)}>
              {busy ? "Saving…" : "Save payment"}
            </button>
            <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => setStep({ kind: "form" })}>
              Change it
            </button>
          </div>
        )}
    </>
  );
}
