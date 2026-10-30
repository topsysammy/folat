// Talks to the WhatsApp Cloud API. ONLY the send gate may call this.
// There is deliberately no template-message function: templates are always
// billed, so the bot cannot send one.

export interface WhatsAppClient {
  sendText(to: string, body: string): Promise<void>;
  /** Uploads a file (free, not a message) and sends it as ONE document message. */
  sendDocument(to: string, filename: string, content: string, caption: string): Promise<void>;
}

export class CloudApiClient implements WhatsAppClient {
  private base: string;

  constructor(private token: string, phoneNumberId: string, apiVersion = "v23.0") {
    this.base = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}`;
  }

  async sendText(to: string, body: string): Promise<void> {
    await this.postMessage({ to, type: "text", text: { body, preview_url: false } });
  }

  async sendDocument(to: string, filename: string, content: string, caption: string): Promise<void> {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", "text/csv");
    form.append("file", new Blob([content], { type: "text/csv" }), filename);
    const res = await fetch(`${this.base}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
      body: form,
    });
    if (!res.ok) throw new Error(`WhatsApp media upload failed: ${res.status} ${await res.text()}`);
    const { id } = await res.json();
    await this.postMessage({ to, type: "document", document: { id, filename, caption } });
  }

  private async postMessage(message: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${this.base}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...message }),
    });
    if (!res.ok) throw new Error(`WhatsApp send failed: ${res.status} ${await res.text()}`);
  }
}
