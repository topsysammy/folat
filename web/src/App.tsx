import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { db } from "./api.ts";
import { AddCustomer } from "./screens/AddCustomer.tsx";
import { CustomerPage } from "./screens/CustomerPage.tsx";
import { Customers } from "./screens/Customers.tsx";
import { Distribution } from "./screens/Distribution.tsx";
import { Home } from "./screens/Home.tsx";
import { Login } from "./screens/Login.tsx";
import { NewSeason } from "./screens/NewSeason.tsx";
import { OldPayments } from "./screens/OldPayments.tsx";
import { Owing } from "./screens/Owing.tsx";
import { PaymentPage } from "./screens/PaymentPage.tsx";
import { PastSeason } from "./screens/PastSeason.tsx";
import { RecordPayment } from "./screens/RecordPayment.tsx";
import { Report } from "./screens/Report.tsx";
import { Settings } from "./screens/Settings.tsx";
import { Today } from "./screens/Today.tsx";
import { StoreProvider } from "./store.tsx";
import { useRoute } from "./ui.tsx";

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    db.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = db.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <div className="center-screen"><div className="spinner" aria-label="Loading" /></div>;
  if (!session) return <Login />;
  return (
    <StoreProvider>
      <main className="app"><Screen /></main>
    </StoreProvider>
  );
}

function Screen() {
  const route = useRoute();
  const [, section, id] = route.split("/");
  const num = id ? Number(id) : undefined;

  switch (section) {
    case "customers":
      return num ? <CustomerPage id={num} /> : <Customers />;
    case "pay":
      return <RecordPayment key={route} customerId={num} />;
    case "add":
      return <AddCustomer />;
    case "owing":
      return <Owing key={route} initial={id === "quiet" ? "quiet" : "behind"} />;
    case "payment":
      return num ? <PaymentPage key={num} id={num} /> : <Home />;
    case "old":
      return <OldPayments key={route} customerId={num} />;
    case "today":
      return <Today />;
    case "distribution":
      return <Distribution />;
    case "settings":
      return <Settings />;
    case "season":
      return <NewSeason />;
    case "seasons":
      return num ? <PastSeason key={num} id={num} /> : <Settings />;
    case "report":
      return <Report />;
    default:
      return <Home />;
  }
}
