import { useEffect, useState } from "react";
import { naira } from "@shared/money.ts";
import { totalsByCustomer } from "@shared/progress.ts";
import { type Distribution, seasonDistributions, seasonPayments } from "../api.ts";
import { useStore } from "../store.tsx";
import { Avatar, longDate, TopBar } from "../ui.tsx";

/** Read-only view of a closed season: what each customer saved and whether they collected. */
export function PastSeason({ id }: { id: number }) {
  const s = useStore();
  const season = s.seasons.find((x) => x.id === id);
  const [data, setData] = useState<{ totals: Map<number, number>; dist: Map<number, Distribution> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([seasonPayments(id), seasonDistributions(id)])
      .then(([payments, dist]) =>
        setData({ totals: totalsByCustomer(payments), dist: new Map(dist.map((d) => [d.customer_id, d])) })
      )
      .catch((e) => setError((e as Error).message));
  }, [id]);

  if (!season) {
    return (
      <>
        <TopBar title="Past season" fallback="/settings" />
        <p className="empty">This season doesn't exist.</p>
      </>
    );
  }

  const people = data
    ? [...data.totals.entries()].filter(([, t]) => t !== 0).sort((a, b) => b[1] - a[1])
    : [];
  const total = people.reduce((t, [, v]) => t + v, 0);

  return (
    <>
      <TopBar title={`Season ${season.name}`} fallback="/settings" />
      <p className="lede">{longDate(season.started_on)} to {longDate(season.distribution_date)} · read only</p>
      {error && <p className="error" role="alert">Couldn't load this season: {error}</p>}
      {!data && !error && <div className="spinner" aria-label="Loading" />}
      {data && (
        <>
          <dl className="facts">
            <div><dt>Total collected</dt><dd className="strong">{naira(total)}</dd></div>
            <div><dt>Customers who saved</dt><dd>{people.length}</dd></div>
            <div><dt>Collected their food</dt><dd>{data.dist.size}</dd></div>
          </dl>
          <div className="section-head"><h2>Customers</h2></div>
          {people.length === 0 ? <p className="empty">No payments in this season.</p> : (
            <ul className="list">
              {people.map(([cid, t]) => {
                const name = s.rowById.get(cid)?.customer.name ?? `Customer #${cid}`;
                const d = data.dist.get(cid);
                return (
                  <li key={cid} className="list-row">
                    <Avatar name={name} dim={!d} />
                    <span className="list-main">
                      <span className="list-title">{name}</span>
                      <span className="list-sub">{d ? `Collected${d.items ? ` · ${d.items}` : ""}` : "Did not collect"}</span>
                    </span>
                    <span className="list-amount">{naira(t)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
