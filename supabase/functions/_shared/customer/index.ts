// PHASE 2 — NOT BUILT YET.
//
// Later, customers will be able to check their balance and report payments
// (status 'pending', source 'customer', proof_path/proof_hash) for the admin to
// approve. That code goes here, so admin code doesn't change.
//
// Phase 1 rules this stub keeps:
//   • it is only called when settings.customers_enabled is true (it's false),
//   • it returns null, so nothing is ever sent,
//   • the send gate refuses audience "customer" anyway.
import type { Repo } from "../repo.ts";
import type { Reply } from "../types.ts";

export function handleCustomerMessage(
  _deps: { repo: Repo; now: Date },
  _msg: { phone: string; messageId: string; text: string | null },
): Promise<Reply | null> {
  return Promise.resolve(null);
}
