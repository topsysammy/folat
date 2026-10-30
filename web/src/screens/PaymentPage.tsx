import { useState } from "react";
import { naira } from "@shared/money.ts";
import { parseAmount } from "@shared/parse/amount.ts";
import { dayLabel, lagosDate, lagosNoon } from "@shared/time.ts";
import type { IsoDate } from "@shared/types.ts";
import { deletePayment, editPayment, type Method, METHODS, undoPayment } from "../api.ts";
import { useStore } from "../store.tsx";
import { Avatar, back, Icon, TopBar } from "../ui.tsx";

/** One payment: see it, edit it, undo it (crossed out) or delete it for good. */
export function PaymentPage({ id }: { id: number }) {
  const s = useStore();
  const p = s.payments.find((x) => x.id === id);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!p) {
    return (
      <>
        <TopBar title="Payment" />
        <p className="empty">This payment no longer exists. It may have been deleted.</p>
      </>
    );
  }
  const c = s.rowById.get(p.customer_id)?.customer;
  const name = c?.name ?? "Unknown";
  const date = lagosDate(p.paid_at);
  const isUndo = p.source === "undo";
  const undone = s.reversed.has(p.id);

  const run = async (fn: () => Promise<void>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await s.reload();
      after?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    const what = isUndo
      ? `Delete this undo entry? The ${naira(-p.amount)} payment it cancelled will count again for ${name}.`
      : `Delete the ${naira(p.amount)} payment from ${name} on ${dayLabel(date)}? It will be erased completely and can't be recovered.`;
    if (confirm(what)) run(() => deletePayment(p.id), () => back(`/customers/${p.customer_id}`));
  };
  const undo = () => {
    if (confirm(`Undo the ${naira(p.amount)} payment from ${name}? It stays in the history, crossed out.`)) {
      run(() => undoPayment(p.id));
    }
  };

  if (editing) return <EditPayment id={id} onDone={() => setEditing(false)} />;

  return (
    <>
      <TopBar title={isUndo ? "Undo entry" : "Payment"} fallback={`/customers/${p.customer_id}`} />
      <section className="review">
        <p className="eyebrow">{isUndo ? "Undo of an earlier payment" : undone ? "Undone" : "Payment"}</p>
        <p className={`review-amount${undone ? " struck" : ""}`}>{naira(p.amount)}</p>
        <p>from <a href={`#/customers/${p.customer_id}`}><b>{name}</b></a> on <b>{dayLabel(date)}</b></p>
        {!isUndo && (
          <p className="muted">
            {METHODS.find((m) => m.value === p.method)?.label ?? "Method not recorded"}
            {p.note && <> · “{p.note}”</>}
          </p>
        )}
      </section>

      {error && <p className="error gap-top" role="alert">{error}</p>}
      <div className="stack gap-top">
        {!isUndo && (
          <button className="btn btn-ink btn-block" disabled={busy} onClick={() => setEditing(true)}>
            <Icon name="edit" /> Edit payment
          </button>
        )}
        {!isUndo && !undone && (
          <button className="btn btn-ghost btn-block" disabled={busy} onClick={undo}>
            <Icon name="undo" /> Undo (keep it crossed out)
          </button>
        )}
        <button className="btn btn-danger-ghost btn-block" disabled={busy} onClick={remove}>
          <Icon name="trash" /> {isUndo ? "Delete undo entry" : "Delete payment"}
        </button>
      </div>
    </>
  );
}

function EditPayment({ id, onDone }: { id: number; onDone: () => void }) {
  const s = useStore();
  const p = s.payments.find((x) => x.id === id)!;
  const original = lagosDate(p.paid_at);
  const [customerId, setCustomerId] = useState(p.customer_id);
  const [amountText, setAmountText] = useState(String(p.amount));
  const [date, setDate] = useState<IsoDate>(original);
  const [method, setMethod] = useState<Method>((p.method as Method | null) ?? "cash");
  const [note, setNote] = useState(p.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active customers, plus the current one even if they were removed.
  const choices = [...s.rowById.values()]
    .filter((r) => r.customer.active || r.customer.id === p.customer_id)
    .map((r) => r.customer)
    .sort((a, b) => a.name.localeCompare(b.name));
  const customer = s.rowById.get(customerId)!.customer;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseAmount(amountText);
    if (!amount) return setError("Enter the amount in naira, like 3500.");
    if (!date || date > s.today) return setError("The date can't be in the future.");
    if (date < customer.start_date) {
      return setError(`${dayLabel(date)} is before ${customer.name} started (${dayLabel(customer.start_date)}).`);
    }
    // Keep the original time if the day didn't change.
    const paidAt = date === original ? p.paid_at : date === s.today ? new Date().toISOString() : lagosNoon(date);

    const changes = [
      customerId !== p.customer_id && `customer → ${customer.name}`,
      amount !== p.amount && `amount ${naira(p.amount)} → ${naira(amount)}`,
      date !== original && `date ${dayLabel(original)} → ${dayLabel(date)}`,
      method !== (p.method ?? "cash") && `method → ${METHODS.find((m) => m.value === method)?.label}`,
      note.trim() !== (p.note ?? "") && "note",
    ].filter(Boolean);
    if (changes.length === 0) return onDone();
    if (!confirm(`Save changes: ${changes.join(", ")}?`)) return;

    setBusy(true);
    setError(null);
    try {
      await editPayment({ id: p.id, customerId, amount, paidAt, method, note });
      await s.reload();
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar title="Edit payment" />
      <form className="stack" onSubmit={save}>
        <label className="field">
          <span>Customer</span>
          <div className="select-wrap">
            <Avatar name={customer.name} />
            <select value={customerId} onChange={(e) => setCustomerId(Number(e.target.value))}>
              {choices.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? "" : " (removed)"}</option>)}
            </select>
          </div>
        </label>
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
          <input maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {s.reversed.has(p.id) && (
          <p className="hint">This payment was undone. Its undo entry will change to match.</p>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-ink btn-block" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        <button type="button" className="btn btn-ghost btn-block" disabled={busy} onClick={onDone}>Cancel</button>
      </form>
    </>
  );
}
