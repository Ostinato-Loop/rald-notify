// RALD Notify — Deliveries Routes — LILCKY STUDIO LIMITED
import { Hono } from "hono";
import type { Bindings, Variables } from "../index";
import { authMiddleware, workspaceMiddleware } from "../lib/middleware";
import { writeAuditLog } from "../lib/audit";

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();
router.use("*", authMiddleware, workspaceMiddleware);

// GET /api/deliveries — list deliveries with full lifecycle
router.get("/", async (c) => {
  const db = c.get("db"); const workspaceId = c.get("workspaceId");
  const { status, channel, notification_id, page = "1", limit = "20" } = c.req.query();
  const offset = (parseInt(page) - 1) * parseInt(limit);
  let q = db.from("notification_deliveries").select("*", { count: "exact" }).eq("workspace_id", workspaceId).order("attempted_at", { ascending: false }).range(offset, offset + parseInt(limit) - 1);
  if (status) q = q.eq("status", status);
  if (channel) q = q.eq("channel", channel);
  if (notification_id) q = q.eq("notification_id", notification_id);
  const { data, count, error } = await q;
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ deliveries: data, total: count, page: parseInt(page), limit: parseInt(limit) });
});

// GET /api/deliveries/:id
router.get("/:id", async (c) => {
  const db = c.get("db");
  const { data } = await db.from("notification_deliveries").select("*").eq("id", c.req.param("id")).eq("workspace_id", c.get("workspaceId")).single();
  if (!data) return c.json({ error: "Not found" }, 404);
  return c.json({ delivery: data });
});

// POST /api/deliveries/:id/retry — manual retry
router.post("/:id/retry", async (c) => {
  const db = c.get("db"); const user = c.get("user"); const workspaceId = c.get("workspaceId");
  const { data: delivery } = await db.from("notification_deliveries").select("*").eq("id", c.req.param("id")).eq("workspace_id", workspaceId).single();
  if (!delivery) return c.json({ error: "Not found" }, 404);
  if (delivery.status === "delivered") return c.json({ error: "Already delivered" }, 409);
  if ((delivery.retry_count ?? 0) >= 5) return c.json({ error: "Max retries (5) reached" }, 409);
  await db.from("notification_deliveries").update({ status: "queued", retry_count: (delivery.retry_count ?? 0) + 1, updated_at: new Date().toISOString() }).eq("id", delivery.id);
  await writeAuditLog(db, { workspaceId, userId: user.id, action: "delivery.retried", resourceType: "notification_delivery", resourceId: delivery.id, status: "success" });
  return c.json({ ok: true, retry_count: (delivery.retry_count ?? 0) + 1 });
});

// POST /api/deliveries/:id/opened — track open (pixel or explicit)
router.post("/:id/opened", async (c) => {
  const db = c.get("db"); const workspaceId = c.get("workspaceId");
  const { data } = await db.from("notification_deliveries").select("id,status").eq("id", c.req.param("id")).eq("workspace_id", workspaceId).single();
  if (!data) return c.json({ error: "Not found" }, 404);
  await db.from("notification_deliveries").update({ opened_at: new Date().toISOString(), status: "opened" }).eq("id", data.id);
  await writeAuditLog(db, { workspaceId, action: "delivery.opened", resourceType: "notification_delivery", resourceId: data.id, status: "success" });
  return c.json({ ok: true });
});

// POST /api/deliveries/:id/clicked — track click
router.post("/:id/clicked", async (c) => {
  const db = c.get("db"); const workspaceId = c.get("workspaceId");
  const { url } = await c.req.json() as { url?: string };
  const { data } = await db.from("notification_deliveries").select("id").eq("id", c.req.param("id")).eq("workspace_id", workspaceId).single();
  if (!data) return c.json({ error: "Not found" }, 404);
  await db.from("notification_deliveries").update({ clicked_at: new Date().toISOString(), clicked_url: url ?? null }).eq("id", data.id);
  await writeAuditLog(db, { workspaceId, action: "delivery.clicked", resourceType: "notification_delivery", resourceId: data.id, status: "success", metadata: { url } });
  return c.json({ ok: true });
});

// GET /api/deliveries/stats — delivery stats summary
router.get("/stats/summary", async (c) => {
  const db = c.get("db"); const workspaceId = c.get("workspaceId");
  const { since } = c.req.query();
  let q = db.from("notification_deliveries").select("status,channel").eq("workspace_id", workspaceId);
  if (since) q = q.gte("attempted_at", since);
  const { data } = await q;
  const stats: Record<string, Record<string, number>> = {};
  for (const d of (data ?? []) as { status: string; channel: string }[]) {
    if (!stats[d.channel]) stats[d.channel] = { delivered: 0, failed: 0, opened: 0, clicked: 0, queued: 0 };
    stats[d.channel][d.status] = (stats[d.channel][d.status] ?? 0) + 1;
  }
  return c.json({ stats });
});

export default router;
