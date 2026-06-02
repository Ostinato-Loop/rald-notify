// RALD Notify — Webhook Channel (HMAC-signed HTTP POST) — LILCKY STUDIO LIMITED
export interface WebhookPayload {
  url: string;
  secret?: string;
  event: string;
  notificationId: string;
  workspaceId: string;
  data: Record<string, unknown>;
}

export interface ChannelResult {
  success: boolean;
  providerId?: string;
  providerResponse?: unknown;
  errorMessage?: string;
  latencyMs: number;
  statusCode?: number;
}

export async function sendWebhook(payload: WebhookPayload): Promise<ChannelResult> {
  const start = Date.now();
  try {
    const body = JSON.stringify({
      event: payload.event,
      notification_id: payload.notificationId,
      workspace_id: payload.workspaceId,
      timestamp: new Date().toISOString(),
      data: payload.data,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-RALD-Event": payload.event,
      "X-RALD-Notification-ID": payload.notificationId,
      "User-Agent": "RALD-Notify/1.0",
    };

    if (payload.secret) {
      const key = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(payload.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
      const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
      headers["X-RALD-Signature"] = `sha256=${sigHex}`;
    }

    const res = await fetch(payload.url, { method: "POST", headers, body, signal: AbortSignal.timeout(10000) });
    const responseText = await res.text().catch(() => "");

    if (res.ok) {
      return { success: true, statusCode: res.status, providerResponse: responseText.slice(0, 500), latencyMs: Date.now() - start };
    }
    return { success: false, statusCode: res.status, errorMessage: `HTTP ${res.status}`, providerResponse: responseText.slice(0, 200), latencyMs: Date.now() - start };
  } catch (err) {
    return { success: false, errorMessage: String(err), latencyMs: Date.now() - start };
  }
}
