import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { livePayments, type Progress, progress, totalsByCustomer } from "@shared/progress.ts";
import { daysBetween, lagosDate } from "@shared/time.ts";
import type { Customer, IsoDate, Payment } from "@shared/types.ts";
import { type Data, db, type Distribution, loadData, NoAccessError, type Season } from "./api.ts";

/** A customer counts as "stopped paying" after this many days without a payment. */
export const QUIET_DAYS = 14;
/** Monthly payers go a month between payments anyway, so they get a month on top. */
const quietLimit = (c: Customer) => (c.plan === "monthly" ? 31 + QUIET_DAYS : QUIET_DAYS);

export interface Row {
  customer: Customer;
  progress: Progress;
  lastPaid: IsoDate | null; // Lagos date of their latest payment that still counts
}

export interface Store extends Data {
  today: IsoDate;
  season: Season;
  rows: Row[]; // active customers
  rowById: Map<number, Row>; // every customer, removed included
  collected: number;
  live: Payment[]; // payments that still count (no undo rows, nothing undone)
  reversed: Set<number>; // ids of payments that were undone
  distByCustomer: Map<number, Distribution>;
  reload: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noAccess, setNoAccess] = useState<string | null>(null); // signed-in email that isn't the owner's

  const reload = async () => {
    try {
      setData(await loadData());
      setError(null);
    } catch (e) {
      if (e instanceof NoAccessError) {
        const { data } = await db.auth.getSession();
        setNoAccess(data.session?.user.email ?? "this account");
      }
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    reload();
  }, []);

  const store = useMemo(() => (data ? derive(data, reload) : null), [data]);

  if (noAccess && !store) {
    return (
      <div className="center-screen">
        <p>
          You're signed in as <b>{noAccess}</b>, which doesn't have access to the records.
        </p>
        <p className="muted">Sign out and sign in with the owner's email.</p>
        <button className="btn btn-ink" onClick={() => db.auth.signOut()}>Sign out</button>
      </div>
    );
  }
  if (error && !store) {
    return (
      <div className="center-screen">
        <p className="muted">Couldn't load your records: {error}</p>
        <button className="btn btn-ink" onClick={reload}>Try again</button>
        <button className="btn btn-ghost" onClick={() => db.auth.signOut()}>Sign out</button>
      </div>
    );
  }
  if (!store) return <div className="center-screen"><div className="spinner" aria-label="Loading" /></div>;
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

function derive(data: Data, reload: () => Promise<void>): Store {
  const today = lagosDate(new Date());
  const totals = totalsByCustomer(data.payments);
  const live = livePayments(data.payments);
  const liveIds = new Set(live.map((p) => p.id));

  const lastPaid = new Map<number, IsoDate>();
  for (const p of live) {
    const d = lagosDate(p.paid_at);
    if ((lastPaid.get(p.customer_id) ?? "") < d) lastPaid.set(p.customer_id, d);
  }

  const rowById = new Map<number, Row>();
  for (const customer of data.customers) {
    rowById.set(customer.id, {
      customer,
      progress: progress(customer, totals.get(customer.id) ?? 0, data.settings, today),
      lastPaid: lastPaid.get(customer.id) ?? null,
    });
  }
  return {
    ...data,
    today,
    season: data.seasons.find((s) => s.id === data.settings.current_season_id) ?? data.seasons[0],
    rows: [...rowById.values()].filter((r) => r.customer.active),
    rowById,
    collected: data.payments.reduce((s, p) => s + p.amount, 0),
    live,
    reversed: new Set(data.payments.filter((p) => p.source !== "undo" && !liveIds.has(p.id)).map((p) => p.id)),
    distByCustomer: new Map(data.distributions.map((d) => [d.customer_id, d])),
    reload,
  };
}

export const mostBehindFirst = (rows: Row[]) =>
  rows.filter((r) => r.progress.behindBy > 0).sort((a, b) => b.progress.behindBy - a.progress.behindBy);

/** Days since the last payment, or since they started if they never paid. */
export function quietDays(row: Row, today: IsoDate): number {
  return daysBetween(row.lastPaid ?? row.customer.start_date, today);
}

/** Active customers with no payment for QUIET_DAYS or more, quietest first. */
export const stoppedPaying = (rows: Row[], today: IsoDate) =>
  rows
    .filter((r) => r.progress.left > 0 && quietDays(r, today) >= quietLimit(r.customer))
    .sort((a, b) => quietDays(b, today) - quietDays(a, today));
