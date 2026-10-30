import { naira } from "@shared/money.ts";
import { dayLabel, shortDate } from "@shared/time.ts";
import { downloadCsv } from "../download.ts";
import { mostBehindFirst, useStore } from "../store.tsx";
import { Icon, TopBar } from "../ui.tsx";

export function Report() {
  const s = useStore();
  const behind = mostBehindFirst(s.rows);
  const onTrack = s.rows.filter((r) => r.progress.onTrack).length;
  const reached = s.rows.filter((r) => r.progress.left === 0).length;

  return (
    <>
      <TopBar title="Report" />
      <p className="lede">As of {dayLabel(s.today)}</p>

      <dl className="facts">
        <div><dt>Total collected</dt><dd className="strong">{naira(s.collected)}</dd></div>
        <div><dt>Active customers</dt><dd>{s.rows.length}</dd></div>
        <div><dt>Up to date</dt><dd>{s.rows.length - behind.length}</dd></div>
        <div><dt>Behind</dt><dd>{behind.length}</dd></div>
        <div><dt>On track for December</dt><dd>{onTrack} of {s.rows.length}</dd></div>
        <div><dt>Reached the {naira(s.settings.target)} target</dt><dd>{reached}</dd></div>
        <div><dt>Distribution day</dt><dd>{shortDate(s.settings.distribution_date)}</dd></div>
      </dl>

      {behind.length > 0 && (
        <>
          <div className="section-head"><h2>Most behind</h2><a href="#/owing">See all</a></div>
          <ol className="ranked">
            {behind.slice(0, 5).map(({ customer: c, progress: p }) => (
              <li key={c.id}><a href={`#/customers/${c.id}`}>{c.name}</a><span>{naira(p.behindBy)}</span></li>
            ))}
          </ol>
        </>
      )}

      <div className="section-head"><h2>Backup</h2></div>
      <p className="muted small">Download every customer and payment as a spreadsheet. Do this once a week and keep the file safe.</p>
      <button className="btn btn-ink btn-block" onClick={() => downloadCsv(s)}><Icon name="download" /> Export CSV</button>
    </>
  );
}
