// The HTTP side of the bot, kept separate from index.ts so tests can drive it
// with an in-memory repo and a fake WhatsApp client.
import { handleAdminMessage } from "./admin/router.ts";
import { handleCustomerMessage } from "./customer/index.ts";
import { R } from "./replies.ts";
import type { Repo } from "./repo.ts";
import { sendReply } from "./sendGate.ts";
import { verifySignature } from "./signature.ts";
import type { Reply } from "./types.ts";
import type { WhatsAppClient } from "./whatsapp.ts";

export interface WebhookDeps {
  repo: Repo;
  wa: WhatsAppClient;
  now: () => Date;
  verifyToken: string;
  appSecret: string;
  adminPhone: string; // from the ADMIN_PHONE secret
}

interface InboundMessage {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
}

export async function handleRequest(req: Request, deps: WebhookDeps): Promise<Response> {
  if (req.method === "GET") return verifySubscription(new URL(req.url), deps);
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const raw = await req.text();
  if (!(await verifySignature(deps.appSecret, raw, req.headers.get("x-hub-signature-256")))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  // Delivery/read status callbacks have no `messages` and are ignored.
  const messages: InboundMessage[] = (body.entry ?? [])
    .flatMap((e: { changes?: { value?: { messages?: InboundMessage[] } }[] }) => e.changes ?? [])
    .flatMap((c: { value?: { messages?: InboundMessage[] } }) => c.value?.messages ?? []);

  for (const msg of messages) {
    try {
      await processMessage(msg, deps);
    } catch (e) {
      // Always answer Meta with 200, otherwise it re-delivers. Duplicates are skipped anyway.
      console.error("message failed", msg.id, e);
    }
  }
  return new Response("ok", { status: 200 });
}

function verifySubscription(url: URL, deps: WebhookDeps): Response {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === deps.verifyToken && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

async function processMessage(msg: InboundMessage, deps: WebhookDeps): Promise<void> {
  const settings = await deps.repo.getSettings();
  const isAdmin = msg.from === deps.adminPhone && msg.from === settings.admin_phone;
  const text = msg.type === "text" ? msg.text?.body ?? "" : null;

  if (!isAdmin) {
    // Phase 1: everyone else is ignored silently — no reply, nothing stored.
    if (settings.customers_enabled) {
      const reply = await handleCustomerMessage(
        { repo: deps.repo, now: deps.now() },
        { phone: msg.from, messageId: msg.id, text },
      );
      if (reply) await sendReply(deps, msg.from, reply, "customer");
    }
    return;
  }

  // Duplicate guard: Meta sometimes delivers the same message twice.
  if (!(await deps.repo.claimMessage(msg.id, msg.from))) return;

  // Opens/extends her 24-hour free reply window before we reply.
  await deps.repo.touchAdminInbound(deps.now().toISOString());

  let reply: Reply;
  if (text === null) {
    reply = { text: R.textOnly };
  } else {
    try {
      reply = await handleAdminMessage(
        { repo: deps.repo, now: deps.now() },
        { phone: msg.from, messageId: msg.id, text },
      );
    } catch (e) {
      console.error("command failed", e);
      reply = { text: R.failed };
    }
  }
  const result = await sendReply(deps, msg.from, reply, "admin");
  if (!result.sent) console.warn("reply not sent:", result.reason);
}
