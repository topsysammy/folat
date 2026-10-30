import { reminderLink } from "@shared/admin/commands/report.ts";
import { naira } from "@shared/money.ts";
import { mostBehindFirst, useStore } from "../store.tsx";
import { Avatar, Icon, TopBar } from "../ui.tsx";

export function Owing() {
  const s = useStore();
  const behind = mostBehindFirst(s.rows);
  const total = behind.reduce((t, r) => t + r.progress.behindBy, 0);

  return (
    <>
      <TopBar title="Who's behind" />
      {behind.length === 0
        ? <p className="empty">Everyone is up to date 🎉</p>
        : (
          <>
            <p className="lede">
              {behind.length} {behind.length === 1 ? "customer owes" : "customers owe"} {naira(total)} in total. Tap{" "}
              <b>Remind</b> to send a WhatsApp message from your own phone.
            </p>
            <ul className="list">
              {behind.map(({ customer: c, progress: p }) => (
                <li key={c.id} className="list-row">
                  <a className="list-link" href={`#/customers/${c.id}`}>
                    <Avatar name={c.name} />
                    <span className="list-main">
                      <span className="list-title">{c.name}</span>
                      <span className="list-sub">Owes {naira(p.behindBy)} · paid {naira(p.total)}</span>
                    </span>
                  </a>
                  <a className="btn btn-ink btn-sm" href={reminderLink(c, p.behindBy)} target="_blank" rel="noreferrer">
                    <Icon name="chat" size={16} /> Remind
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
    </>
  );
}
