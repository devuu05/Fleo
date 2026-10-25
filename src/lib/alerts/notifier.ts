export interface AlertMessage { to: string; subject: string; text: string; html?: string }

/** One implementation per channel. WhatsApp / push plug in here later. */
export interface Notifier {
  readonly channel: "email" | "whatsapp" | "push";
  /** true when a real provider delivers it; false when we only log to the outbox */
  readonly live: boolean;
  send(m: AlertMessage): Promise<void>;
}

export class LoggedEmailNotifier implements Notifier {
  readonly channel = "email" as const;
  readonly live = false;
  async send() {}
}

/** https://resend.com — plain REST, no SDK. */
export class ResendEmailNotifier implements Notifier {
  readonly channel = "email" as const;
  readonly live = true;
  constructor(private apiKey: string, private from: string, private fetchImpl: typeof fetch = fetch) {}
  async send(m: AlertMessage) {
    const res = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
  }
}

export function createNotifiers(): Notifier[] {
  const key = process.env.RESEND_API_KEY;
  return [key ? new ResendEmailNotifier(key, process.env.ALERT_FROM ?? "Fleo <alerts@example.com>") : new LoggedEmailNotifier()];
}
