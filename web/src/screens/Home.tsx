import { useState } from "react";
import { naira } from "@shared/money.ts";
import { daysBetween, lagosDate, shortDate } from "@shared/time.ts";
import { mostBehindFirst, QUIET_DAYS, stoppedPaying, useStore } from "../store.tsx";
import { collectedIn } from "./Today.tsx";
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
  const onTrack = s.rows.filter((r) => r.progress.onTrack).length;
  const quiet = stoppedPaying(s.rows, s.today);
  const today = collectedIn(s, "today");
  const week = collectedIn(s, "week");
  const sum = (list: { amount: number }[]) => list.reduce((t, p) => t + p.amount, 0);
  const recent = s.payments.slice(-6).reverse();

  return (
    <>
      <header className="home-head">
        <div>
          <p className="muted">{greeting()},</p>
          <p className="home-name">Folat Place</p>
        </div>
        <div className="head-actions">
          <button className="icon-btn icon-btn-soft" onClick={() => go("/owing")} aria-label="Follow up">
            <Icon name="bell" />
            {(behind.length > 0 || quiet.length > 0) && <span className="dot" />}
          </button>
          <button className="icon-btn icon-btn-soft" onClick={() => go("/settings")} aria-label="Settings">
            <Icon name="gear" />
          </button>
        </div>
      </header>

      <section className="hero-card">
        <div className="hero-top">
          <p className="eyebrow">Collected so far</p>
          <span className="tag">{shortDate(s.settings.distribution_date)} distribution</span>
        </div>
        <div className="hero-amount">
          <span className="amount-xl">{hidden ? "₦ • • • • •" : naira(s.collected)}</span>
          <button className="icon-btn icon-btn-ghost" onClick={toggle} aria-label={hidden ? "Show total" : "Hide total"}>
            <Icon name={hidden ? "eyeOff" : "eye"} />
          </button>
        </div>
        <Segments value={s.collected} of={goal} dark />
        <p className="hero-sub">
          {goal > 0 ? `of ${naira(goal)} for ${s.rows.length} customers` : "Add your first customer to start"}
          {" · "}
          {daysLeft === 0 ? "distribution day" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} to go`}
        </p>
        <div className="hero-actions">
          <button className="btn btn-white" onClick={() => go("/pay")}><Icon name="plus" /> Record payment</button>
          <button className="btn btn-smoke" onClick={() => go("/add")}><Icon name="users" /> Add customer</button>
        </div>
      </section>

      <a className="today-card" href="#/today">
        <span>
          <span className="tile-label">Today</span>
          <span className="today-amount">{hidden ? "₦ • • •" : naira(sum(today))}</span>
          <span className="tile-sub">{today.length} payment{today.length === 1 ? "" : "s"}</span>
        </span>
        <span>
          <span className="tile-label">This week</span>
          <span className="today-amount">{hidden ? "₦ • • •" : naira(sum(week))}</span>
          <span className="tile-sub">{week.length} payment{week.length === 1 ? "" : "s"}</span>
        </span>
        <Icon name="chevron" />
      </a>

      <div className="section-head">
        <h2>Customers</h2>
        <a href="#/customers">View all</a>
      </div>
      <div className="tiles">
        <button className="tile" onClick={() => go("/customers")}>
          <span className="tile-label">Up to date</span>
          <span className="tile-num">{s.rows.length - behind.length}</span>
          <span className="tile-sub">of {s.rows.length}</span>
        </button>
        <button className="tile" onClick={() => go("/owing")}>
          <span className="tile-label">Behind</span>
          <span className={`tile-num${behind.length ? " bad" : ""}`}>{behind.length}</span>
          <span className="tile-sub">{naira(behind.reduce((t, r) => t + r.progress.behindBy, 0))}</span>
        </button>
        <button className="tile" onClick={() => go("/report")}>
          <span className="tile-label">On track</span>
          <span className="tile-num">{onTrack}</span>
          <span className="tile-sub">for December</span>
        </button>
      </div>

      {quiet.length > 0 && (
        <a className="notice notice-link" href="#/owing/quiet">
          <span>
            <b>{quiet.length} {quiet.length === 1 ? "customer hasn't" : "customers haven't"}</b> paid in {QUIET_DAYS}+ days
          </span>
          <Icon name="chevron" />
        </a>
      )}

      <div className="section-head"><h2>Quick actions</h2></div>
      <nav className="quick">
        <a href="#/customers"><span className="quick-icon"><Icon name="users" /></span>Customers</a>
        <a href="#/owing"><span className="quick-icon"><Icon name="chat" /></span>Follow up</a>
        <a href="#/distribution"><span className="quick-icon"><Icon name="gift" /></span>Distribution</a>
        <a href="#/report"><span className="quick-icon"><Icon name="chart" /></span>Report</a>
      </nav>

      <div className="section-head"><h2>Recent payments</h2></div>
      {recent.length === 0
        ? <p className="empty">No payments yet. Tap <b>Record payment</b> when a customer pays.</p>
        : (
          <ul className="list">
            {recent.map((p) => {
              const c = s.rowById.get(p.customer_id)?.customer;
              const undone = p.source === "undo" || s.reversed.has(p.id);
              return (
                <li key={p.id}>
                  <a className="list-row" href={`#/customers/${p.customer_id}`}>
                    <Avatar name={c?.name ?? "?"} dim={undone} />
                    <span className="list-main">
                      <span className="list-title">{c?.name ?? "Unknown"}</span>
                      <span className="list-sub">
                        {p.source === "undo" ? "Undone" : s.reversed.has(p.id) ? "Payment · undone" : "Payment"} ·{" "}
                        {shortDate(lagosDate(p.paid_at))}
                      </span>
                    </span>
                    <span className={`list-amount${p.amount < 0 ? " neg" : ""}${s.reversed.has(p.id) ? " struck" : ""}`}>
                      {p.amount > 0 ? "+" : ""}{naira(p.amount)}
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
