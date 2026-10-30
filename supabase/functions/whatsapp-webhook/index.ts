// Supabase Edge Function entry point. Wires real dependencies into the webhook.
import { loadConfig } from "../_shared/config.ts";
import { SupabaseRepo } from "../_shared/supabaseRepo.ts";
import { handleRequest } from "../_shared/webhook.ts";
import { CloudApiClient } from "../_shared/whatsapp.ts";

const config = loadConfig();
const deps = {
  repo: new SupabaseRepo(config.supabaseUrl, config.supabaseServiceRoleKey),
  wa: new CloudApiClient(config.whatsappToken, config.phoneNumberId),
  now: () => new Date(),
  verifyToken: config.verifyToken,
  appSecret: config.appSecret,
  adminPhone: config.adminPhone,
};

Deno.serve((req) => handleRequest(req, deps));
