// RALD Notify — Audit Log Routes — LILCKY STUDIO LIMITED
import { Hono } from "hono";
import type { Bindings, Variables } from "../index";
import { authMiddleware, adminMiddleware, workspaceMiddleware } from "../lib/middleware";

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();
router.use("*", authMiddleware, workspaceMiddleware, adminMiddleware);

// GET /api/audit — query audit log
router.get("/", async (c) => {
  const db = c.get("db"); const workspaceId = c.get("workspaceId");
  const { action, user_id, resource_type, since, until, page = "1", limit = "50" } = c.req.query();
  const offset = (parseInt(page) - 1) * parseInt(limit);
  let q = db.from("notification_audit_log").select("*", { count: "exact" }).eq("workspace_id", workspaceId).order("created_at", { ascending: false }).range(offset, offset + parseInt(limit) - 1);
  if (action) q = q.eq("action", action);
  if (user_id) q = q.eq("user_id", user_id);
  if (resource_type) q = q.eq("resource_type", resource_type);
  if (since) q = q.gte("created_at", since);
  if (until) q = q.lte("created_at", until);
  const { data, count, error } = await q;
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ logs: data, total: count, page: parseInt(page), limit: parseInt(limit) });
});

export default router;
