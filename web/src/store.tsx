import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { livePayments, type Progress, progress, totalsByCustomer } from "@shared/progress.ts";
import { lagosDate } from "@shared/time.ts";
import type { Customer, IsoDate, Payment } from "@shared/types.ts";
import { type Data, loadData } from "./api.ts";

export interface Row {
  customer: Customer;
  progress: Progress;
}

export interface Store extends Data {
  today: IsoDate;
  rows: Row[]; // active customers
  rowById: Map<number, Row>; // every customer, removed included
  collected: number;
  reversed: Set<number>; // ids of payments that were undone
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

  const reload = async () => {
    try {
      setData(await loadData());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    reload();
  }, []);

  const store = useMemo(() => (data ? derive(data, reload) : null), [data]);

  if (error && !store) {
    return (
      <div className="center-screen">
        <p className="muted">Couldn't load your records: {error}</p>
        <button className="btn btn-ink" onClick={reload}>Try again</button>
      </div>
    );
  }
  if (!store) return <div className="center-screen"><div className="spinner" aria-label="Loading" /></div>;
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

function derive(data: Data, reload: () => Promise<void>): Store {
  const today = lagosDate(new Date());
  const totals = totalsByCustomer(data.payments);
  const rowById = new Map<number, Row>();
  for (const customer of data.customers) {
    rowById.set(customer.id, {
      customer,
      progress: progress(customer, totals.get(customer.id) ?? 0, data.settings, today),
    });
  }
  const live = new Set(livePayments(data.payments).map((p) => p.id));
  const reversed = new Set(
    data.payments.filter((p) => p.source !== "undo" && !live.has(p.id)).map((p: Payment) => p.id),
  );
  return {
    ...data,
    today,
    rows: [...rowById.values()].filter((r) => r.customer.active),
    rowById,
    collected: data.payments.reduce((s, p) => s + p.amount, 0),
    reversed,
    reload,
  };
}

export const mostBehindFirst = (rows: Row[]) =>
  rows.filter((r) => r.progress.behindBy > 0).sort((a, b) => b.progress.behindBy - a.progress.behindBy);
