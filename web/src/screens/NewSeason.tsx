import { useState } from "react";
import { naira } from "@shared/money.ts";
import { startNewSeason } from "../api.ts";
import { downloadCsv } from "../download.ts";
import { useStore } from "../store.tsx";
import { go, Icon, longDate, TopBar } from "../ui.tsx";
import { Done } from "./Done.tsx";

export function NewSeason() {
  const s = useStore();
  const nextYear = String(Number(s.season.distribution_date.slice(0, 4)) + 1);
  const [name, setName] = useState(nextYear);
  // 1 January of the new year, or today if that has already passed.
  const [start, setStart] = useState(() => (s.today > `${nextYear}-01-01` ? s.today : `${nextYear}-01-01`));
  const [distribution, setDistribution] = useState(`${nextYear}-12-20`);
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<string | null>(null); // name of the season just closed

  if (closed) {
    return (
      <Done
        title={`Season ${name.trim()} started`}
        body={`Totals start again from ₦0. Season ${closed} is saved under Settings → Past seasons.`}
        primary={{ label: "Back to home", onClick: () => go("/") }}
      />
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Give the new season a name, like 2027.");
    if (!start || !distribution || distribution <= start) {
      return setError("The distribution day must be after the start date.");
    }
    if (s.seasons.some((x) => x.name.toLowerCase() === name.trim().toLowerCase())) {
      return setError(`There's already a season called ${name.trim()}. Pick another name.`);
    }
    if (!confirm(
      `Close season ${s.season.name} and start ${name.trim()}? This season's ${naira(s.collected)} stays saved as a past season, ` +
        `and every customer's total starts again from ₦0.`,
    )) return;

    setBusy(true);
    setError(null);
    try {
      const old = s.season.name;
      await startNewSeason({ name: name.trim(), startedOn: start, distributionDate: distribution, keepCustomers: keep });
      await s.reload();
      setClosed(old);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar title="New season" fallback="/settings" />
      <section className="review review-left">
        <p className="eyebrow">What happens</p>
        <p>
          Season <b>{s.season.name}</b> ({naira(s.collected)} collected) is closed and kept as a past season you can open
          any time. Nothing is deleted.
        </p>
        <p>Every customer's total starts again from ₦0 for the new season.</p>
      </section>

      <button className="btn btn-ghost btn-block gap-top" onClick={() => downloadCsv(s)}>
        <Icon name="download" /> Download a backup first
      </button>

      <form className="stack gap-top" onSubmit={submit}>
        <label className="field">
          <span>New season name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Starts on</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          <span>Distribution day</span>
          <input type="date" value={distribution} onChange={(e) => setDistribution(e.target.value)} />
          <small className="hint">{distribution && `Customers save towards ${longDate(distribution)}.`}</small>
        </label>
        <fieldset className="field">
          <legend>Customers</legend>
          <div className="segmented segmented-2">
            <label className={keep ? "on" : ""}>
              <input type="radio" name="keep" checked={keep} onChange={() => setKeep(true)} />
              Keep all {s.rows.length}
              <small>They start saving again from the start date</small>
            </label>
            <label className={!keep ? "on" : ""}>
              <input type="radio" name="keep" checked={!keep} onChange={() => setKeep(false)} />
              Start empty
              <small>Everyone is moved to Removed; restore who returns</small>
            </label>
          </div>
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-ink btn-block" disabled={busy}>{busy ? "Starting…" : `Start season ${name.trim()}`}</button>
      </form>
    </>
  );
}
