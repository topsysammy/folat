import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The money/progress/CSV logic is shared with the WhatsApp bot, so totals and
// "behind by" are computed the same way everywhere.
const shared = fileURLToPath(new URL("../supabase/functions/_shared", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@shared": shared } },
  server: { fs: { allow: [".."] } },
});
