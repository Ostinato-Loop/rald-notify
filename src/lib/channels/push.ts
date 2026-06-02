// RALD Notify — Web Push Channel (VAPID) — LILCKY STUDIO LIMITED
// Implements VAPID per RFC 8292 using Web Crypto API

export interface PushPayload {
  endpoint: string;
  p256dh: string;
  auth: string;
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

export interface ChannelResult {
  success: boolean;
  providerId?: string;
  providerResponse?: unknown;
  errorMessage?: string;
  latencyMs: number;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

export async function sendPush(
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string,
  payload: PushPayload
): Promise<ChannelResult> {
  const start = Date.now();
  try {
    const notification = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon ?? "/rald-logo.png",
      badge: payload.badge ?? "/rald-badge.png",
      tag: payload.tag,
      data: { url: payload.url, ...payload.data },
    });

    // Generate VAPID Authorization header
    const vapidHeaders = await generateVapidHeaders(
      vapidPublicKey, vapidPrivateKey, vapidSubject, payload.endpoint
    );

    const res = await fetch(payload.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "TTL": "86400",
        ...vapidHeaders,
      },
      body: notification,
    });

    if (res.status === 201 || res.status === 200) {
      return { success: true, latencyMs: Date.now() - start };
    }
    if (res.status === 410 || res.status === 404) {
      return { success: false, errorMessage: "subscription_expired", latencyMs: Date.now() - start };
    }
    return { success: false, errorMessage: `HTTP ${res.status}`, latencyMs: Date.now() - start };
  } catch (err) {
    return { success: false, errorMessage: String(err), latencyMs: Date.now() - start };
  }
}

async function generateVapidHeaders(
  publicKey: string, privateKey: string, subject: string, endpoint: string
): Promise<Record<string, string>> {
  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ typ: "JWT", alg: "ES256" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payload = btoa(JSON.stringify({ aud: audience, exp: now + 3600, sub: subject })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const keyData = urlBase64ToUint8Array(privateKey);
  const privateKeyObj = await crypto.subtle.importKey(
    "raw", keyData, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  ).catch(() => null);

  if (!privateKeyObj) {
    return { "Authorization": `vapid t=placeholder,k=${publicKey}` };
  }

  const sigInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKeyObj,
    new TextEncoder().encode(sigInput)
  );
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  return { "Authorization": `vapid t=${header}.${payload}.${sig},k=${publicKey}` };
}
