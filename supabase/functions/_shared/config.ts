import { parsePhone } from "./parse/phone.ts";

export interface Config {
  whatsappToken: string;
  phoneNumberId: string;
  verifyToken: string;
  appSecret: string;
  adminPhone: string; // 234XXXXXXXXXX
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}

/** Reads secrets from the environment. Fails loudly if any are missing. */
export function loadConfig(): Config {
  const need = (name: string) => {
    const v = Deno.env.get(name);
    if (!v) throw new Error(`Missing secret ${name}`);
    return v;
  };
  const adminPhone = parsePhone(need("ADMIN_PHONE"));
  if (!adminPhone) throw new Error("ADMIN_PHONE is not a valid Nigerian number");
  return {
    whatsappToken: need("WHATSAPP_TOKEN"),
    phoneNumberId: need("PHONE_NUMBER_ID"),
    verifyToken: need("VERIFY_TOKEN"),
    appSecret: need("APP_SECRET"),
    adminPhone,
    // Provided automatically to every Supabase Edge Function.
    supabaseUrl: need("SUPABASE_URL"),
    supabaseServiceRoleKey: need("SUPABASE_SERVICE_ROLE_KEY"),
  };
}
