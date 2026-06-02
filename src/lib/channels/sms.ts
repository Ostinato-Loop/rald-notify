// RALD Notify — SMS Channel (Termii primary, Twilio fallback) — LILCKY STUDIO LIMITED
export interface SmsPayload {
  to: string;
  message: string;
  senderId?: string;
}

export interface ChannelResult {
  success: boolean;
  providerId?: string;
  providerResponse?: unknown;
  errorMessage?: string;
  latencyMs: number;
  provider?: string;
}

export async function sendSms(
  termiiKey: string | undefined,
  twilioSid: string | undefined,
  twilioToken: string | undefined,
  twilioFrom: string | undefined,
  payload: SmsPayload
): Promise<ChannelResult> {
  const start = Date.now();

  // Primary: Termii
  if (termiiKey) {
    try {
      const res = await fetch("https://api.ng.termii.com/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: termiiKey,
          to: payload.to,
          from: payload.senderId ?? "RALD",
          sms: payload.message,
          type: "plain",
          channel: "generic",
        }),
      });
      const data = await res.json() as { message_id?: string; message?: string; code?: string };
      if (res.ok && data.message_id) {
        return { success: true, providerId: data.message_id, providerResponse: data, latencyMs: Date.now() - start, provider: "termii" };
      }
    } catch (err) {
      console.warn("[sms] termii failed, trying twilio:", err);
    }
  }

  // Fallback: Twilio
  if (twilioSid && twilioToken && twilioFrom) {
    try {
      const body = new URLSearchParams({ From: twilioFrom, To: payload.to, Body: payload.message });
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${btoa(`${twilioSid}:${twilioToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });
      const data = await res.json() as { sid?: string; error_message?: string };
      if (res.ok && data.sid) {
        return { success: true, providerId: data.sid, providerResponse: data, latencyMs: Date.now() - start, provider: "twilio" };
      }
      return { success: false, errorMessage: data.error_message ?? `HTTP ${res.status}`, latencyMs: Date.now() - start, provider: "twilio" };
    } catch (err) {
      return { success: false, errorMessage: String(err), latencyMs: Date.now() - start, provider: "twilio" };
    }
  }

  return { success: false, errorMessage: "No SMS provider configured", latencyMs: Date.now() - start };
}
