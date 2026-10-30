import { useState } from "react";
import { naira } from "@shared/money.ts";
import { parseAmount } from "@shared/parse/amount.ts";
import { dayLabel } from "@shared/time.ts";
import { db, type EditableSettings, saveSettings } from "../api.ts";
import { useStore } from "../store.tsx";
import { go, Icon, longDate, TopBar } from "../ui.tsx";

/** The values the app started with. The distribution day stays in this season's year. */
const defaults = (distributionDate: string): EditableSettings => ({
  target: 150000,
  daily_amount: 500,
  weekly_amount: 3500,
  monthly_amount: 15000,
  distribution_date: `${distributionDate.slice(0, 4)}-12-20`,
});

const FIELDS: { key: Exclude<keyof EditableSettings, "distribution_date">; label: string; hint: string }[] = [
  { key: "target", label: "Savings target per customer", hint: "What each customer saves towards by December" },
  { key: "daily_amount", label: "Daily plan", hint: "Paid every day" },
  { key: "weekly_amount", label: "Weekly plan", hint: "Paid every week" },
  { key: "monthly_amount", label: "Monthly plan", hint: "Paid every month" },
];

export function Settings() {
  const s = useStore();
  const toText = (v: EditableSettings) => ({
    target: String(v.target),
    daily_amount: String(v.daily_amount),
    weekly_amount: String(v.weekly_amount),
    monthly_amount: String(v.monthly_amount),
    distribution_date: v.distribution_date,
  });
  const [form, setForm] = useState(() => toText(s.settings));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const pastSeasons = s.seasons.filter((x) => x.id !== s.season.id);

  const write = async (v: EditableSettings, message: string) => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await saveSettings(v);
      await s.reload();
      setForm(toText(v));
      setSaved(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = {} as EditableSettings;
    for (const f of FIELDS) {
      const n = parseAmount(form[f.key]);
      if (!n) return setError(`Enter the ${f.label.toLowerCase()} in naira, like 3500.`);
      v[f.key] = n;
    }
    if (!form.distribution_date || form.distribution_date <= s.season.started_on) {
      return setError(`The distribution day must be after the season started (${dayLabel(s.season.started_on)}).`);
    }
    v.distribution_date = form.distribution_date;
    write(v, "Changes saved.");
  };

  const reset = () => {
    const d = defaults(s.settings.distribution_date);
    if (!confirm(
      `Reset to the original values? Target ${naira(d.target)}; daily ${naira(d.daily_amount)}, weekly ${
        naira(d.weekly_amount)
      }, monthly ${naira(d.monthly_amount)}; distribution on ${dayLabel(d.distribution_date)}.`,
    )) return;
    write(d, "Reset to the original values.");
  };

  return (
    <>
      <TopBar title="Settings" />

      <form className="stack" onSubmit={submit}>
        {FIELDS.map((f) => (
          <label key={f.key} className="field">
            <span>{f.label}</span>
            <div className="amount-input amount-input-sm">
              <span aria-hidden="true">₦</span>
              <input id={f.key} inputMode="numeric" value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            </div>
            <small className="hint">{f.hint}</small>
          </label>
        ))}
        <label className="field">
          <span>Distribution day</span>
          <input type="date" value={form.distribution_date}
            onChange={(e) => setForm({ ...form, distribution_date: e.target.value })} />
          <small className="hint">Used for “on track for December” and the countdown on Home.</small>
        </label>
        <p className="hint">
          Changing a plan amount changes what every customer on that plan should have paid by now.
        </p>
        {error && <p className="error" role="alert">{error}</p>}
        {saved && <p className="ok" role="status">{saved}</p>}
        <button className="btn btn-ink btn-block" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        <button type="button" className="btn btn-ghost btn-block" disabled={busy} onClick={reset}>
          Reset to original values
        </button>
      </form>

      <div className="section-head"><h2>Season</h2></div>
      <dl className="facts">
        <div><dt>Current season</dt><dd>{s.season.name}</dd></div>
        <div><dt>Started</dt><dd>{longDate(s.season.started_on)}</dd></div>
        <div><dt>Distribution</dt><dd>{longDate(s.settings.distribution_date)}</dd></div>
      </dl>
      <button className="btn btn-ghost btn-block gap-top" onClick={() => go("/season/new")}>Start a new season</button>

      {pastSeasons.length > 0 && (
        <>
          <div className="section-head"><h2>Past seasons</h2></div>
          <ul className="list">
            {pastSeasons.map((x) => (
              <li key={x.id}>
                <a className="list-row" href={`#/seasons/${x.id}`}>
                  <span className="list-main">
                    <span className="list-title">{x.name}</span>
                    <span className="list-sub">{longDate(x.started_on)} to {longDate(x.distribution_date)}</span>
                  </span>
                  <Icon name="chevron" />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      <button className="btn btn-ghost btn-block signout" onClick={() => db.auth.signOut()}>
        <Icon name="logout" /> Sign out
      </button>
    </>
  );
}
