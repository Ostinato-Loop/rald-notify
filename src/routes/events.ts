// RALD Notify — Event Types Routes — LILCKY STUDIO LIMITED
import { Hono } from "hono";
import type { Bindings, Variables } from "../index";
import { authMiddleware, adminMiddleware, workspaceMiddleware } from "../lib/middleware";
import { writeAuditLog } from "../lib/audit";

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();
router.use("*", authMiddleware, workspaceMiddleware);

// GET /api/events — list registered event types
router.get("/", async (c) => {
  const db = c.get("db"); const workspaceId = c.get("workspaceId");
  const { data } = await db.from("notification_events").select("*").eq("workspace_id", workspaceId).is("deleted_at", null).order("name");
  return c.json({ events: data ?? [] });
});

// POST /api/events — register a new event type
router.post("/", adminMiddleware, async (c) => {
  const db = c.get("db"); const user = c.get("user"); const workspaceId = c.get("workspaceId");
  const body = await c.req.json() as { name: string; slug: string; description?: string; default_channels?: string[]; template_id?: string };
  if (!body.name || !body.slug) return c.json({ error: "name and slug required" }, 400);
  const { data, error } = await db.from("notification_events").insert({ workspace_id: workspaceId, created_by: user.id, name: body.name, slug: body.slug, description: body.description ?? null, default_channels: body.default_channels ?? [], template_id: body.template_id ?? null }).select().single();
  if (error?.code === "23505") return c.json({ error: "Event slug already exists" }, 409);
  if (error) return c.json({ error: error.message }, 500);
  await writeAuditLog(db, { workspaceId, userId: user.id, action: "event.registered", resourceType: "notification_event", resourceId: data.id, status: "success", metadata: { slug: body.slug } });
  return c.json({ event: data }, 201);
});

// DELETE /api/events/:id — soft delete
router.delete("/:id", adminMiddleware, async (c) => {
  const db = c.get("db"); const user = c.get("user"); const workspaceId = c.get("workspaceId");
  const { data } = await db.from("notification_events").select("id").eq("id", c.req.param("id")).eq("workspace_id", workspaceId).is("deleted_at", null).single();
  if (!data) return c.json({ error: "Not found" }, 404);
  await db.from("notification_events").update({ deleted_at: new Date().toISOString() }).eq("id", data.id);
  await writeAuditLog(db, { workspaceId, userId: user.id, action: "event.registered", resourceType: "notification_event", resourceId: data.id, status: "success", metadata: { action: "deleted" } });
  return c.json({ ok: true });
});

export default router;
