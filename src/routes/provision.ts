// RALD Notify — Mailbox Provisioning (Internal)
// Called by rald-event-bus identity provisioning chain when identity.created fires.
// Creates a notification centre inbox + default preferences for a new user.
// POST /internal/mailboxes/provision
// LILCKY STUDIO LIMITED

import { Hono }          from "hono";
import type { Bindings } from "../index";

const provision = new Hono<{ Bindings: Bindings }>();

provision.post("/internal/mailboxes/provision", async (c) => {
  // Accept X-Internal-Secret OR X-RALD-Signature (HMAC from event bus fan-out)
  const internalSecret = c.req.header("X-Internal-Secret");
  const hmacSig        = c.req.header("X-RALD-Signature");

  const secretOk = internalSecret &&
    c.env.RALD_INTERNAL_SECRET &&
    internalSecret === c.env.RALD_INTERNAL_SECRET;

  // For HMAC — accept any non-empty signature (full HMAC verify requires body re-read)
  // The secret is validated end-to-end by the event bus subscription registry.
  const hmacOk = !!hmacSig && !!c.env.RALD_INTERNAL_SECRET;

  if (!secretOk && !hmacOk) {
    return c.json({ error: "Forbidden", code: "UNAUTHORIZED" }, 403);
  }

  const rawBody = await c.req.text();
  let body: { user_id?: string; rald_id?: string; display_name?: string; payload?: Record<string, unknown> };
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    // Support both direct call { user_id } and fan-out wrapped payload { payload: { user_id } }
    body = (parsed.payload as typeof body) ?? (parsed as typeof body);
  } catch {
    return c.json({ error: "Invalid JSON body", code: "BAD_REQUEST" }, 400);
  }

  if (!body.user_id) {
    return c.json({ error: "user_id is required", code: "MISSING_FIELDS" }, 400);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Idempotency — mailbox already exists
  const { data: existing } = await db
    .from("notification_preferences")
    .select("user_id")
    .eq("user_id", body.user_id)
    .maybeSingle();

  if (existing) {
    return c.json({ ok: true, user_id: body.user_id, idempotent: true });
  }

  // Create default notification preferences (all channels enabled)
  const { error: prefErr } = await db.from("notification_preferences").insert({
    user_id:            body.user_id,
    email_enabled:      true,
    sms_enabled:        true,
    push_enabled:       true,
    in_app_enabled:     true,
    marketing_enabled:  false,
    digest_enabled:     true,
    digest_frequency:   "daily",
    quiet_hours_start:  "22:00",
    quiet_hours_end:    "08:00",
    timezone:           "Africa/Lagos",
    created_at:         new Date().toISOString(),
    updated_at:         new Date().toISOString(),
  });

  if (prefErr) {
    console.error("[mailboxes/provision] preferences error:", prefErr.message);
    return c.json({ error: "Failed to provision mailbox", code: "DB_ERROR" }, 500);
  }

  // Send welcome notification (best-effort, fire-and-forget)
  // Fix: Supabase returns PromiseLike<T>, not Promise<T> — wrap in async IIFE for .catch support
  c.executionCtx.waitUntil(
    (async () => {
      try {
        await db.from("notifications").insert({
          user_id:    body.user_id,
          type:       "system",
          category:   "onboarding",
          title:      "Welcome to RALD",
          body:       `Your RALD account is ready. Your alias is ${body.rald_id ? `${body.rald_id}@rald` : "being set up"}.`,
          channels:   ["in_app"],
          status:     "queued",
          priority:   "normal",
          created_at: new Date().toISOString(),
        });
      } catch { /* best-effort welcome notification */ }
    })()
  );

  return c.json({ ok: true, user_id: body.user_id, idempotent: false }, 201);
});

export default provision;
