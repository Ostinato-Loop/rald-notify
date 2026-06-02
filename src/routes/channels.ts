// RALD Notify — Channel Config Routes — LILCKY STUDIO LIMITED
import { Hono } from "hono";
import type { Bindings, Variables } from "../index";
import { authMiddleware, adminMiddleware, workspaceMiddleware } from "../lib/middleware";
import { writeAuditLog } from "../lib/audit";

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();
router.use("*", authMiddleware, workspaceMiddleware);

const SUPPORTED_CHANNELS = ["email", "sms", "push", "webhook"];
const FUTURE_CHANNELS = ["messenger", "whatsapp", "instagram", "facebook"];

// GET /api/channels — list channel configs for workspace
router.get("/", async (c) => {
  const db = c.get("db"); const workspaceId = c.get("workspaceId");
  const { data } = await db.from("notification_channels").select("id,workspace_id,channel_type,enabled,created_at,updated_at").eq("workspace_id", workspaceId);
  const channels = SUPPORTED_CHANNELS.map(type => {
    const cfg = data?.find((d: any) => d.channel_type === type);
    return { channel_type: type, enabled: cfg?.enabled ?? false, configured: !!cfg, id: cfg?.id };
  });
  return c.json({ channels, future_channels: FUTURE_CHANNELS.map(type => ({ channel_type: type, status: "planned" })) });
});

// PUT /api/channels/:type — configure a channel
router.put("/:type", adminMiddleware, async (c) => {
  const db = c.get("db"); const user = c.get("user"); const workspaceId = c.get("workspaceId");
  const type = c.req.param("type");
  if (!SUPPORTED_CHANNELS.includes(type)) return c.json({ error: `Channel '${type}' not supported. Supported: ${SUPPORTED_CHANNELS.join(", ")}` }, 400);
  const body = await c.req.json() as { enabled?: boolean; config?: Record<string, unknown> };
  const { data, error } = await db.from("notification_channels").upsert({
    workspace_id: workspaceId, channel_type: type,
    enabled: body.enabled ?? true, config: body.config ?? {},
    updated_at: new Date().toISOString(),
  }, { onConflict: "workspace_id,channel_type" }).select("id,workspace_id,channel_type,enabled,created_at,updated_at").single();
  if (error) return c.json({ error: error.message }, 500);
  await writeAuditLog(db, { workspaceId, userId: user.id, action: body.enabled === false ? "channel.disabled" : "channel.configured", resourceType: "notification_channel", resourceId: data.id, status: "success", metadata: { channel_type: type } });
  return c.json({ channel: data });
});

export default router;
