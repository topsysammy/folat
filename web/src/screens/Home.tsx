import { useState } from "react";
import { naira } from "@shared/money.ts";
import { dayLabel, daysBetween, lagosDate, shortDate } from "@shared/time.ts";
import { METHODS } from "../api.ts";
import { mostBehindFirst, QUIET_DAYS, stoppedPaying, useStore } from "../store.tsx";
import { collectedIn, lagosTime } from "./Today.tsx";
import { Avatar, go, Icon, Segments } from "../ui.tsx";

const HIDE_KEY = "hideTotal";

function greeting(): string {
  const hour = (new Date().getUTCHours() + 1) % 24; // Lagos is UTC+1
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export function Home() {
  const s = useStore();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setHidden(!hidden);
    try {
      localStorage.setItem(HIDE_KEY, hidden ? "0" : "1");
    } catch { /* private mode: just don't remember */ }
  };

  const goal = s.rows.length * s.settings.target;
  const daysLeft = Math.max(daysBetween(s.today, s.settings.distribution_date), 0);
  const behind = mostBehindFirst(s.rows);
  const quiet = stoppedPaying(s.rows, s.today);
  const today = collectedIn(s, "today");
  const todaySum = today.reduce((t, p) => t + p.amount, 0);
  const recent = s.payments.slice(-5).reverse();
  const pct = goal > 0 ? Math.min(100, Math.round((s.collected / goal) * 100)) : 0;
  const quietNames = quiet.slice(0, 2).map((r) => r.customer.name.split(" ")[0]);

  return (
    <>
      <header className="home-head">
        <div className="home-who">
          <span className="avatar" style={{ background: "#f3e8cf" }} aria-hidden="true">FP</span>
          <div>
            <p>{dayLabel(s.today)}</p>
            <p className="home-name">{greeting()}, Folat</p>
          </div>
        </div>
        <button className="icon-btn icon-btn-soft" onClick={() => go("/owing")} aria-label="Follow up">
          <Icon name="bell" size={19} />
          {(behind.length > 0 || quiet.length > 0) && <span className="dot" />}
        </button>
      </header>

      <section className="balance">
        <p className="balance-label">Collected so far</p>
        <div className="balance-amount">
          <b>{hidden ? "₦ • • • • •" : naira(s.collected)}</b>
          <button className="icon-btn icon-btn-plain" onClick={toggle} aria-label={hidden ? "Show total" : "Hide total"}>
            <Icon name={hidden ? "eye" : "eyeOff"} />
          </button>
        </div>
        <div className="balance-row">
          <a className="today-link" href="#/today">
            <span className="green"><Icon name="up" size={16} stroke={2.2} /></span>
            <b>{hidden ? "₦ • • •" : naira(todaySum)}</b> collected today
          </a>
          <button className="btn btn-ink btn-md" onClick={() => go("/pay")}><Icon name="plus" size={18} stroke={2.2} /> Record</button>
        </div>
        <div className="balance-foot">
          <Segments value={s.collected} of={goal} />
          <p>
            {goal > 0 ? `${pct}% of the ${naira(goal)} goal` : "Add your first customer to start"}
            {" · "}
            {daysLeft === 0 ? "distribution day" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} to ${shortDate(s.settings.distribution_date)}`}
          </p>
        </div>
      </section>

      <div className="section-head"><h2>Quick actions</h2></div>
      <nav className="quick">
        <a href="#/customers"><span className="quick-icon"><Icon name="users" /></span>Customers</a>
        <a href="#/owing"><span className="quick-icon"><Icon name="chat" /></span>Follow up</a>
        <a href="#/distribution"><span className="quick-icon"><Icon name="gift" /></span>Distribution</a>
        <a href="#/report"><span className="quick-icon"><Icon name="chart" /></span>Report</a>
      </nav>

      {quiet.length > 0 && (
        <a className="banner starry" href="#/owing/quiet">
          <span>
            <b>{quiet.length} {quiet.length === 1 ? "customer" : "customers"} stopped paying</b>
            <small>
              {quietNames.join(" and ")}{quiet.length > 2 ? ` and ${quiet.length - 2} more` : ""}{" "}
              {quiet.length === 1 ? "hasn't" : "haven't"} paid in {QUIET_DAYS}+ days. Send them a check-in?
            </small>
          </span>
          <span className="btn btn-white">Review</span>
        </a>
      )}

      {behind.length > 0 && (
        <>
          <div className="section-head">
            <h2>Most behind</h2>
            <a href="#/owing">See all <Icon name="chevron" size={14} stroke={2.2} /></a>
          </div>
          <div className="scroller">
            {behind.slice(0, 6).map(({ customer: c, progress: p }) => (
              <a key={c.id} className="behind-card" href={`#/customers/${c.id}`}>
                <Avatar name={c.name} />
                <span>
                  <span className="list-title">{c.name}</span>
                  <span className="status status-bad" style={{ fontSize: 13 }}>
                    <Icon name="clock" size={14} stroke={2.2} /> Behind {naira(p.behindBy)}
                  </span>
                </span>
                <span className="list-end">
                  <span className="list-amount">{naira(p.total)}</span>
                  <span className="list-note">paid</span>
                </span>
              </a>
            ))}
          </div>
        </>
      )}

      <div className="section-head">
        <h2>Recent payments</h2>
        <a href="#/today">See all <Icon name="chevron" size={14} stroke={2.2} /></a>
      </div>
      {recent.length === 0
        ? <p className="empty">No payments yet. Tap <b>Record</b> when a customer pays.</p>
        : (
          <ul className="list">
            {recent.map((p) => {
              const c = s.rowById.get(p.customer_id)?.customer;
              const undone = p.source === "undo" || s.reversed.has(p.id);
              const method = METHODS.find((m) => m.value === p.method)?.label;
              return (
                <li key={p.id}>
                  <a className="list-row" href={`#/payment/${p.id}`}>
                    <Avatar name={c?.name ?? "?"} dim={undone} />
                    <span className="list-main">
                      <span className="list-title">{c?.name ?? "Unknown"}</span>
                      <span className="list-sub">
                        {p.source === "undo"
                          ? "Undo entry"
                          : [method, s.reversed.has(p.id) ? "Undone" : "Payment"].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="list-end">
                      <span className={`list-amount${p.amount < 0 ? " neg" : ""}${s.reversed.has(p.id) ? " struck" : ""}`}>
                        {p.amount > 0 ? "+" : ""}{naira(p.amount)}
                      </span>
                      <span className="list-note">{shortDate(lagosDate(p.paid_at))}, {lagosTime(p.paid_at)}</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
    </>
  );
}
