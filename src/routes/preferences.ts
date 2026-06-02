// RALD Notify — Preferences Routes — LILCKY STUDIO LIMITED
import { Hono } from "hono";
import type { Bindings, Variables } from "../index";
import { authMiddleware, workspaceMiddleware } from "../lib/middleware";
import { writeAuditLog } from "../lib/audit";

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();
router.use("*", authMiddleware, workspaceMiddleware);

// GET /api/preferences — get workspace or user preferences
router.get("/", async (c) => {
  const db = c.get("db"); const user = c.get("user"); const workspaceId = c.get("workspaceId");
  const { scope = "user" } = c.req.query();
  let q = db.from("notification_preferences").select("*").eq("workspace_id", workspaceId);
  if (scope === "user") q = q.eq("user_id", user.id).is("channel", null);
  else q = q.is("user_id", null);
  const { data } = await q;
  return c.json({ preferences: data ?? [] });
});

// PUT /api/preferences — upsert preferences
router.put("/", async (c) => {
  const db = c.get("db"); const user = c.get("user"); const workspaceId = c.get("workspaceId");
  const body = await c.req.json() as {
    scope: "user" | "workspace";
    channel?: string;
    email_enabled?: boolean;
    sms_enabled?: boolean;
    push_enabled?: boolean;
    webhook_enabled?: boolean;
    muted?: boolean;
    mute_until?: string;
    digest_enabled?: boolean;
    digest_frequency?: string;
    critical_override?: boolean;
    event_filters?: string[];
  };
  const record = {
    workspace_id: workspaceId,
    user_id: body.scope === "user" ? user.id : null,
    channel: body.channel ?? null,
    email_enabled: body.email_enabled ?? true,
    sms_enabled: body.sms_enabled ?? true,
    push_enabled: body.push_enabled ?? true,
    webhook_enabled: body.webhook_enabled ?? true,
    muted: body.muted ?? false,
    mute_until: body.mute_until ?? null,
    digest_enabled: body.digest_enabled ?? false,
    digest_frequency: body.digest_frequency ?? "daily",
    critical_override: body.critical_override ?? true,
    event_filters: body.event_filters ?? [],
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db.from("notification_preferences").upsert(record, { onConflict: "workspace_id,user_id,channel" }).select().single();
  if (error) return c.json({ error: error.message }, 500);
  await writeAuditLog(db, { workspaceId, userId: user.id, action: "preference.updated", resourceType: "notification_preference", resourceId: data.id, status: "success", metadata: { scope: body.scope, channel: body.channel } });
  return c.json({ preference: data });
});

// POST /api/preferences/mute — mute a channel or all channels
router.post("/mute", async (c) => {
  const db = c.get("db"); const user = c.get("user"); const workspaceId = c.get("workspaceId");
  const { channel, until } = await c.req.json() as { channel?: string; until?: string };
  const { data, error } = await db.from("notification_preferences").upsert({
    workspace_id: workspaceId, user_id: user.id, channel: channel ?? null,
    muted: true, mute_until: until ?? null, critical_override: true,
  }, { onConflict: "workspace_id,user_id,channel" }).select().single();
  if (error) return c.json({ error: error.message }, 500);
  await writeAuditLog(db, { workspaceId, userId: user.id, action: "preference.updated", resourceType: "notification_preference", resourceId: data.id, status: "success", metadata: { action: "mute", channel } });
  return c.json({ preference: data, muted: true });
});

export default router;
