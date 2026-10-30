import { naira } from "@shared/money.ts";
import { daysBetween, dayLabel, shortDate } from "@shared/time.ts";
import { downloadCsv } from "../download.ts";
import { mostBehindFirst, useStore } from "../store.tsx";
import { Icon, Segments, TopBar } from "../ui.tsx";

export function Report() {
  const s = useStore();
  const behind = mostBehindFirst(s.rows);
  const onTrack = s.rows.filter((r) => r.progress.onTrack).length;
  const reached = s.rows.filter((r) => r.progress.left === 0).length;
  const goal = s.rows.length * s.settings.target;
  const pct = goal > 0 ? Math.min(100, Math.round((s.collected / goal) * 100)) : 0;
  const daysLeft = Math.max(daysBetween(s.today, s.settings.distribution_date), 0);

  const stats: { icon: Parameters<typeof Icon>[0]["name"]; tint: string; value: string; label: string; href?: string }[] = [
    { icon: "users", tint: "#dbe5f8", value: String(s.rows.length), label: "Active customers", href: "#/customers" },
    { icon: "check", tint: "#d9eedf", value: String(s.rows.length - behind.length), label: "Up to date" },
    { icon: "clock", tint: "#f8dfe0", value: String(behind.length), label: "Behind", href: "#/owing" },
    { icon: "leaf", tint: "#f3e8cf", value: `${onTrack} of ${s.rows.length}`, label: "On track for December" },
    { icon: "target", tint: "#e4ddf6", value: String(reached), label: `Reached ${naira(s.settings.target)}` },
    { icon: "cal", tint: "#d8eef3", value: shortDate(s.settings.distribution_date), label: "Distribution day" },
  ];

  return (
    <>
      <TopBar title="Report" />
      <section className="balance">
        <p className="balance-label">Total collected · as of {dayLabel(s.today)}</p>
        <div className="balance-amount"><b>{naira(s.collected)}</b></div>
        <div className="balance-foot" style={{ marginTop: 4 }}>
          <Segments value={s.collected} of={goal} />
          <p>{goal > 0 ? `${pct}% of the ${naira(goal)} goal · ` : ""}{daysLeft} days to {shortDate(s.settings.distribution_date)}</p>
        </div>
      </section>

      <div className="stats gap-top" style={{ marginTop: 24 }}>
        {stats.map((x) => {
          const body = (
            <>
              <span className="icon-tile icon-tile-sm" style={{ background: x.tint }}><Icon name={x.icon} size={18} /></span>
              <span><b>{x.value}</b><small>{x.label}</small></span>
            </>
          );
          return x.href
            ? <a key={x.label} className="stat" href={x.href}>{body}</a>
            : <div key={x.label} className="stat">{body}</div>;
        })}
      </div>

      {behind.length > 0 && (
        <>
          <div className="section-head">
            <h2>Most behind</h2>
            <a href="#/owing">See all <Icon name="chevron" size={14} stroke={2.2} /></a>
          </div>
          <ol className="ranked">
            {behind.slice(0, 5).map(({ customer: c, progress: p }) => (
              <li key={c.id}><a href={`#/customers/${c.id}`}>{c.name}</a><span>{naira(p.behindBy)}</span></li>
            ))}
          </ol>
        </>
      )}

      <section className="card stack" style={{ marginTop: 28 }}>
        <div className="set-row">
          <span className="icon-tile"><Icon name="download" /></span>
          <span>
            <b style={{ fontWeight: 600 }}>Backup</b>
            <small>Every customer and payment as a spreadsheet. Do this once a week and keep the file safe.</small>
          </span>
        </div>
        <button className="btn btn-ink btn-block" onClick={() => downloadCsv(s)}><Icon name="download" /> Export CSV</button>
      </section>
    </>
  );
}
