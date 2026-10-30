import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { db } from "./api.ts";
import { AddCustomer } from "./screens/AddCustomer.tsx";
import { CustomerPage } from "./screens/CustomerPage.tsx";
import { Customers } from "./screens/Customers.tsx";
import { Home } from "./screens/Home.tsx";
import { Login } from "./screens/Login.tsx";
import { Owing } from "./screens/Owing.tsx";
import { RecordPayment } from "./screens/RecordPayment.tsx";
import { Report } from "./screens/Report.tsx";
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
      return <Owing />;
    case "report":
      return <Report />;
    default:
      return <Home />;
  }
}
