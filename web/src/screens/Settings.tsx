import { useEffect, useState } from "react";
import { naira } from "@shared/money.ts";
import { parseAmount } from "@shared/parse/amount.ts";
import { dayLabel } from "@shared/time.ts";
import { db, type EditableSettings, saveSettings } from "../api.ts";
import { useStore } from "../store.tsx";
import { go, Icon, longDate, PageTitle } from "../ui.tsx";

/** The values the app started with. The distribution day stays in this season's year. */
const defaults = (distributionDate: string): EditableSettings => ({
  target: 150000,
  daily_amount: 500,
  weekly_amount: 3500,
  monthly_amount: 15000,
  distribution_date: `${distributionDate.slice(0, 4)}-12-20`,
});

const FIELDS: { key: Exclude<keyof EditableSettings, "distribution_date">; label: string; hint: string }[] = [
  { key: "target", label: "Savings target", hint: "Per customer, by December" },
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
  const [email, setEmail] = useState("");
  useEffect(() => {
    db.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? ""));
  }, []);

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
      <PageTitle eyebrow={`Season ${s.season.name}`} title="Settings" />
      <div className="profile">
        <span className="avatar avatar-lg" style={{ background: "#f3e8cf", width: 52, height: 52, borderRadius: 16, fontSize: 18 }}
          aria-hidden="true">FP</span>
        <span>
          <b>Folat Place</b>
          <small>{email}</small>
        </span>
      </div>

      <div className="section-head"><h2>Savings plan</h2></div>
      <form className="stack" onSubmit={submit}>
        <div className="set-rows">
          {FIELDS.map((f) => (
            <label key={f.key} className="set-row">
              <span><b>{f.label}</b><small>{f.hint}</small></span>
              <span className="set-input">
                <i aria-hidden="true">₦</i>
                <input id={f.key} inputMode="numeric" value={form[f.key]} aria-label={f.label}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </span>
            </label>
          ))}
          <label className="set-row">
            <span><b>Distribution day</b><small>Countdown on Home</small></span>
            <span className="set-input">
              <input type="date" value={form.distribution_date} aria-label="Distribution day"
                onChange={(e) => setForm({ ...form, distribution_date: e.target.value })} />
            </span>
          </label>
        </div>
        <p className="hint">Changing a plan amount changes what every customer on that plan should have paid by now.</p>
        {error && <p className="error" role="alert">{error}</p>}
        {saved && <p className="ok" role="status">{saved}</p>}
        <div className="row-2">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={reset}>
            <Icon name="refresh" size={18} /> Reset
          </button>
          <button className="btn btn-ink" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </form>

      <div className="section-head"><h2>Before the app</h2></div>
      <button className="link-card" onClick={() => go("/old")}>
        <span className="icon-tile" style={{ background: "#d9eedf" }}><Icon name="chat" /></span>
        <span><b>Add old payments</b><small>From her WhatsApp chats</small></span>
        <Icon name="chevron" size={18} />
      </button>

      <div className="section-head"><h2>Season</h2></div>
      <dl className="facts" style={{ marginTop: 0 }}>
        <div><dt>Current season</dt><dd>{s.season.name}</dd></div>
        <div><dt>Started</dt><dd>{longDate(s.season.started_on)}</dd></div>
        <div><dt>Distribution</dt><dd>{longDate(s.settings.distribution_date)}</dd></div>
        <span className="sep" />
        <a className="link-card" href="#/season/new" style={{ padding: 0 }}>
          <span className="icon-tile"><Icon name="refresh" /></span>
          <span><b>Start a new season</b><small>Close {s.season.name} and start again from ₦0</small></span>
          <Icon name="chevron" size={18} />
        </a>
      </dl>
      {pastSeasons.map((x) => (
        <a key={x.id} className="link-card gap-top" href={`#/seasons/${x.id}`}>
          <span className="icon-tile" style={{ background: "#e4ddf6" }}><Icon name="archive" /></span>
          <span><b>Season {x.name}</b><small>{longDate(x.started_on)} to {longDate(x.distribution_date)}</small></span>
          <Icon name="chevron" size={18} />
        </a>
      ))}

      <button className="btn btn-danger-ghost btn-block signout" onClick={() => db.auth.signOut({ scope: "local" })}>
        <Icon name="logout" /> Sign out
      </button>
    </>
  );
}
