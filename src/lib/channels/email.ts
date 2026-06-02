// RALD Notify — Email Channel (Resend) — LILCKY STUDIO LIMITED
export interface EmailPayload {
  to: string | string[];
  from?: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

export interface ChannelResult {
  success: boolean;
  providerId?: string;
  providerResponse?: unknown;
  errorMessage?: string;
  latencyMs: number;
}

export async function sendEmail(apiKey: string, payload: EmailPayload): Promise<ChannelResult> {
  const start = Date.now();
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: payload.from ?? "RALD <notify@rald.cloud>",
        to: Array.isArray(payload.to) ? payload.to : [payload.to],
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
        reply_to: payload.replyTo,
        tags: payload.tags,
      }),
    });
    const data = await res.json() as { id?: string; statusCode?: number; message?: string };
    if (!res.ok) {
      return { success: false, errorMessage: data.message ?? `HTTP ${res.status}`, latencyMs: Date.now() - start };
    }
    return { success: true, providerId: data.id, providerResponse: data, latencyMs: Date.now() - start };
  } catch (err) {
    return { success: false, errorMessage: String(err), latencyMs: Date.now() - start };
  }
}
