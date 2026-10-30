import { useState } from "react";
import { naira } from "@shared/money.ts";
import { planAmount } from "@shared/progress.ts";
import { addCustomer } from "../api.ts";
import { useStore } from "../store.tsx";
import { go, TopBar } from "../ui.tsx";
import { CustomerForm, type CustomerValues } from "./CustomerForm.tsx";
import { Done } from "./Done.tsx";

export function AddCustomer() {
  const s = useStore();
  const [added, setAdded] = useState<(CustomerValues & { id: number }) | null>(null);

  if (added) {
    return (
      <Done
        title={`${added.name} added`}
        body={`${added.plan[0].toUpperCase()}${added.plan.slice(1)} plan, ${naira(planAmount(s.settings, added.plan))} each time.`}
        primary={added.start_date < s.today
          ? { label: "Add their payments from before today", onClick: () => go(`/old/${added.id}`) }
          : { label: "Record their first payment", onClick: () => go(`/pay/${added.id}`) }}
        secondary={{ label: "Back to home", onClick: () => go("/") }}
      />
    );
  }

  return (
    <>
      <TopBar title="Add customer" />
      <CustomerForm
        withStart
        submitLabel="Add customer"
        onSubmit={async (v) => {
          const id = await addCustomer(v);
          await s.reload();
          setAdded({ ...v, id });
        }}
      />
    </>
  );
}
