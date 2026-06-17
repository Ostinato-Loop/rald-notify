// RALD Notify — Notification Center Routes
// Sprint: Operator Platform Phase 7 · 2026-06-12
// Unified notification feed: all products publish here; users read from one place.
// LILCKY STUDIO LIMITED

import { Hono } from "hono";
import { requireMachinePublish, requireMachineAuth } from "../lib/machine-auth";
import type { Bindings, Variables } from "../index";

const notificationCenter = new Hono<{ Bindings: Bindings; Variables: Variables }>();


// ── POST /center/publish — product publishes a notification ───────────────────
// Any RALD product sends here. Writes to notification_center table.
// Delivery (push/SMS/email) handled by existing rald-notify channels.
// Requires scope: "notify:publish"
notificationCenter.post("/center/publish", requireMachinePublish(), async (c) => {

  const db = c.get("db");
  const body = await c.req.json<{
    user_id:           string;
    product:           string;
    notification_type: string;
    title:             string;
    body:              string;
    icon?:             string;
    image_url?:        string;
    deep_link?:        string;
    web_url?:          string;
    actor_id?:         string;
    entity_id?:        string;
    entity_type?:      string;
    metadata?:         Record<string, unknown>;
    group_key?:        string;
    channels?:         string[];
  }>().catch(() => null);

  if (!body?.user_id || !body.product || !body.notification_type || !body.title || !body.body) {
    return c.json({ error: "user_id, product, notification_type, title, body required" }, 400);
  }

  // Check user notification preferences
  const { data: pref } = await db.from("notification_preferences")
    .select("in_app_enabled,push_enabled,sms_enabled,email_enabled")
    .eq("user_id", body.user_id).eq("product", body.product)
    .eq("notification_type", body.notification_type).single();

  const channelsRequested = body.channels ?? ["in_app"];
  const channelsSent: string[] = [];

  // Write to notification_center (in-app feed) if enabled
  const inAppEnabled = pref?.in_app_enabled ?? true;
  if (inAppEnabled && channelsRequested.includes("in_app")) {
    const { data: nc } = await db.from("notification_center").insert({
      user_id:           body.user_id,
      product:           body.product,
      notification_type: body.notification_type,
      title:             body.title,
      body:              body.body,
      icon:              body.icon ?? null,
      image_url:         body.image_url ?? null,
      deep_link:         body.deep_link ?? null,
      web_url:           body.web_url ?? null,
      actor_id:          body.actor_id ?? null,
      entity_id:         body.entity_id ?? null,
      entity_type:       body.entity_type ?? null,
      metadata:          body.metadata ?? {},
      group_key:         body.group_key ?? null,
      channels_sent:     [],
    }).select("id").single();
    if (nc) channelsSent.push("in_app");
  }

  // Update channels_sent
  if (channelsSent.length > 0) {
    await db.from("notification_center")
      .update({ channels_sent: channelsSent })
      .eq("user_id", body.user_id).eq("product", body.product)
      .order("created_at", { ascending: false }).limit(1);
  }

  return c.json({ ok: true, channels_sent: channelsSent, user_id: body.user_id }, 202);
});

// ── GET /center — user's notification feed ────────────────────────────────────
notificationCenter.get("/center", async (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ error: "X-User-Id header required" }, 401);

  const db = c.get("db");
  const limit  = Math.min(Number(c.req.query("limit") ?? "50"), 100);
  const unread = c.req.query("unread") === "true";
  const product = c.req.query("product");

  let q = db.from("notification_center").select("*")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unread) q = q.is("read_at", null);
  if (product) q = q.eq("product", product);

  const { data, error } = await q;
  if (error) return c.json({ error: "Failed to fetch notifications" }, 500);

  // Count unread
  const { count } = await db.from("notification_center")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId).is("read_at", null).is("archived_at", null);

  return c.json({ notifications: data ?? [], unread_count: count ?? 0 });
});

// ── POST /center/read — mark notifications as read ───────────────────────────
notificationCenter.post("/center/read", async (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ error: "X-User-Id header required" }, 401);

  const db = c.get("db");
  const body = await c.req.json<{ ids?: string[]; all?: boolean }>().catch((): { ids?: string[]; all?: boolean } => ({}));

  if (body.all) {
    await db.from("notification_center").update({ read_at: new Date().toISOString() })
      .eq("user_id", userId).is("read_at", null);
    return c.json({ ok: true, marked: "all" });
  }
  if (body.ids?.length) {
    await db.from("notification_center").update({ read_at: new Date().toISOString() })
      .eq("user_id", userId).in("id", body.ids);
    return c.json({ ok: true, marked: body.ids.length });
  }
  return c.json({ error: "ids or all required" }, 400);
});

// ── DELETE /center/:id — archive a notification ───────────────────────────────
notificationCenter.delete("/center/:id", async (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ error: "X-User-Id header required" }, 401);

  const db = c.get("db");
  await db.from("notification_center").update({ archived_at: new Date().toISOString() })
    .eq("id", c.req.param("id")).eq("user_id", userId);
  return c.json({ ok: true });
});

// ── GET /center/preferences — user's notification preferences ─────────────────
notificationCenter.get("/center/preferences", async (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ error: "X-User-Id header required" }, 401);

  const db = c.get("db");
  const { data } = await db.from("notification_preferences").select("*").eq("user_id", userId);
  return c.json({ preferences: data ?? [] });
});

// ── PUT /center/preferences — update preferences ──────────────────────────────
notificationCenter.put("/center/preferences", async (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ error: "X-User-Id header required" }, 401);

  const db = c.get("db");
  const body = await c.req.json<{
    product: string; notification_type: string;
    in_app_enabled?: boolean; push_enabled?: boolean;
    sms_enabled?: boolean; email_enabled?: boolean;
  }>().catch(() => null);
  if (!body?.product || !body.notification_type) {
    return c.json({ error: "product and notification_type required" }, 400);
  }
  const { data, error } = await db.from("notification_preferences").upsert({
    user_id: userId, product: body.product, notification_type: body.notification_type,
    in_app_enabled: body.in_app_enabled ?? true, push_enabled: body.push_enabled ?? true,
    sms_enabled: body.sms_enabled ?? false, email_enabled: body.email_enabled ?? false,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,product,notification_type" }).select().single();
  if (error) return c.json({ error: "Failed to update preferences" }, 500);
  return c.json(data);
});

// ── POST /center/push-token — register push token ────────────────────────────
notificationCenter.post("/center/push-token", async (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ error: "X-User-Id header required" }, 401);

  const db = c.get("db");
  const body = await c.req.json<{ device_id: string; platform: string; token: string }>().catch(() => null);
  if (!body?.device_id || !body.platform || !body.token) {
    return c.json({ error: "device_id, platform, token required" }, 400);
  }
  await db.from("push_tokens").upsert({
    user_id: userId, device_id: body.device_id, platform: body.platform,
    token: body.token, is_active: true, last_used: new Date().toISOString(),
  }, { onConflict: "user_id,device_id" });
  return c.json({ ok: true });
});

// ── GET /center/types — all notification types (for preferences UI) ───────────
notificationCenter.get("/center/types", async (c) => {
  const db = c.get("db");
  const product = c.req.query("product");
  let q = db.from("notification_types").select("*").eq("can_disable", true).order("product,name");
  if (product) q = q.eq("product", product);
  const { data } = await q;
  return c.json({ types: data ?? [] });
});

export default notificationCenter;
