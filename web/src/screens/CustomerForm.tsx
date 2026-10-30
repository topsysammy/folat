import { useState } from "react";
import { localPhone, naira } from "@shared/money.ts";
import { tidyName } from "@shared/parse/command.ts";
import { parsePhone } from "@shared/parse/phone.ts";
import { planAmount } from "@shared/progress.ts";
import { type Customer, type IsoDate, type Plan, PLANS } from "@shared/types.ts";
import { useStore } from "../store.tsx";

export interface CustomerValues {
  name: string;
  phone: string; // 234XXXXXXXXXX
  plan: Plan;
  start_date: IsoDate;
}

/** Add and Edit share this form; `withStart` shows the start date (only set when adding). */
export function CustomerForm({ customer, withStart = false, submitLabel, onSubmit, onCancel }: {
  customer?: Customer;
  withStart?: boolean;
  submitLabel: string;
  onSubmit: (v: CustomerValues) => Promise<void>;
  onCancel?: () => void;
}) {
  const s = useStore();
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer ? localPhone(customer.phone) : "");
  const [plan, setPlan] = useState<Plan>(customer?.plan ?? "weekly");
  const [start, setStart] = useState<IsoDate>(customer?.start_date ?? s.today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tidy = tidyName(name);
    const parsed = parsePhone(phone);
    if (!tidy) return setError("Enter the customer's name.");
    if (!parsed) return setError("That phone number doesn't look right. Use a Nigerian mobile number like 0801 234 5678.");
    const clash = s.rows.find((r) => r.customer.id !== customer?.id && r.customer.name.toLowerCase() === tidy.toLowerCase());
    if (clash) return setError(`You already have a customer called ${clash.customer.name}. Add a surname or initial to tell them apart.`);
    if (start > s.today) return setError("The start date can't be in the future.");

    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name: tidy, phone: parsed, plan, start_date: start });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>Full name</span>
        <input autoComplete="off" autoCapitalize="words" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Phone number</span>
        <input type="tel" inputMode="tel" placeholder="0801 234 5678" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <fieldset className="field">
        <legend>Plan</legend>
        <div className="segmented">
          {PLANS.map((p) => (
            <label key={p} className={plan === p ? "on" : ""}>
              <input type="radio" name="plan" value={p} checked={plan === p} onChange={() => setPlan(p)} />
              <span className="cap">{p}</span>
              <small>{naira(planAmount(s.settings, p))}</small>
            </label>
          ))}
        </div>
      </fieldset>
      {withStart && (
        <label className="field">
          <span>Started saving on</span>
          <input type="date" max={s.today} value={start} onChange={(e) => setStart(e.target.value)} />
          <small className="hint">Pick an earlier date if they joined before today. It sets what they should have paid by now.</small>
        </label>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-ink btn-block" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
      {onCancel && <button type="button" className="btn btn-ghost btn-block" onClick={onCancel}>Cancel</button>}
    </form>
  );
}
