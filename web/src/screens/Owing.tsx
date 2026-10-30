import { useState } from "react";
import { reminderLink } from "@shared/admin/commands/report.ts";
import { naira } from "@shared/money.ts";
import { shortDate } from "@shared/time.ts";
import { checkInLink } from "../messages.ts";
import { mostBehindFirst, QUIET_DAYS, quietDays, stoppedPaying, useStore } from "../store.tsx";
import { Avatar, Icon, TopBar } from "../ui.tsx";

type Tab = "behind" | "quiet";

export function Owing({ initial = "behind" }: { initial?: Tab }) {
  const s = useStore();
  const [tab, setTab] = useState<Tab>(initial);
  const behind = mostBehindFirst(s.rows);
  const quiet = stoppedPaying(s.rows, s.today);
  const total = behind.reduce((t, r) => t + r.progress.behindBy, 0);

  return (
    <>
      <TopBar title="Follow up" />
      <div className="chips" role="tablist">
        <button role="tab" aria-selected={tab === "behind"} className={`chip${tab === "behind" ? " on" : ""}`}
          onClick={() => setTab("behind")}>Behind · {behind.length}</button>
        <button role="tab" aria-selected={tab === "quiet"} className={`chip${tab === "quiet" ? " on" : ""}`}
          onClick={() => setTab("quiet")}>Stopped paying · {quiet.length}</button>
      </div>

      {tab === "behind"
        ? behind.length === 0
          ? <p className="empty">Everyone is up to date 🎉</p>
          : (
            <>
              <p className="lede">
                {behind.length} {behind.length === 1 ? "customer owes" : "customers owe"} {naira(total)} in total. Tap{" "}
                <b>Remind</b> to send a WhatsApp message from your own phone.
              </p>
              <ul className="list">
                {behind.map((row) => (
                  <li key={row.customer.id} className="list-row">
                    <a className="list-link" href={`#/customers/${row.customer.id}`}>
                      <Avatar name={row.customer.name} />
                      <span className="list-main">
                        <span className="list-title">{row.customer.name}</span>
                        <span className="list-sub">Owes {naira(row.progress.behindBy)} · paid {naira(row.progress.total)}</span>
                      </span>
                    </a>
                    <a className="btn btn-ink btn-sm" href={reminderLink(row.customer, row.progress.behindBy)} target="_blank"
                      rel="noreferrer">
                      <Icon name="chat" size={16} /> Remind
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )
        : quiet.length === 0
        ? <p className="empty">Everyone has paid in the last {QUIET_DAYS} days.</p>
        : (
          <>
            <p className="lede">
              No payment in {QUIET_DAYS} days or more (monthly plans: a month and {QUIET_DAYS} days). Tap{" "}
              <b>Check in</b> to ask how they're doing.
            </p>
            <ul className="list">
              {quiet.map((row) => {
                const days = quietDays(row, s.today);
                return (
                  <li key={row.customer.id} className="list-row">
                    <a className="list-link" href={`#/customers/${row.customer.id}`}>
                      <Avatar name={row.customer.name} />
                      <span className="list-main">
                        <span className="list-title">{row.customer.name}</span>
                        <span className="list-sub">
                          {row.lastPaid ? `Last paid ${shortDate(row.lastPaid)} · ${days} days ago` : `Never paid · joined ${days} days ago`}
                        </span>
                      </span>
                    </a>
                    <a className="btn btn-ink btn-sm" href={checkInLink(row, days)} target="_blank" rel="noreferrer">
                      <Icon name="chat" size={16} /> Check in
                    </a>
                  </li>
                );
              })}
            </ul>
          </>
        )}
    </>
  );
}
