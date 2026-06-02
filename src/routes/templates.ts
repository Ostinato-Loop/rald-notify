// RALD Notify — Templates Routes — LILCKY STUDIO LIMITED
import { Hono } from "hono";
import type { Bindings, Variables } from "../index";
import { authMiddleware, workspaceMiddleware } from "../lib/middleware";
import { writeAuditLog } from "../lib/audit";
import { validateTemplate, renderNotification, extractVariables } from "../lib/template";

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();
router.use("*", authMiddleware, workspaceMiddleware);

// GET /api/templates
router.get("/", async (c) => {
  const db = c.get("db");
  const workspaceId = c.get("workspaceId");
  const { page = "1", limit = "20", channel } = c.req.query();
  const offset = (parseInt(page) - 1) * parseInt(limit);
  let q = db.from("notification_templates").select("*", { count: "exact" }).eq("workspace_id", workspaceId).is("deleted_at", null).order("created_at", { ascending: false }).range(offset, offset + parseInt(limit) - 1);
  if (channel) q = q.contains("channels", [channel]);
  const { data, count, error } = await q;
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ templates: data, total: count, page: parseInt(page), limit: parseInt(limit) });
});

// GET /api/templates/:id
router.get("/:id", async (c) => {
  const db = c.get("db");
  const { data } = await db.from("notification_templates").select("*").eq("id", c.req.param("id")).eq("workspace_id", c.get("workspaceId")).is("deleted_at", null).single();
  if (!data) return c.json({ error: "Not found" }, 404);
  return c.json({ template: { ...data, variables: extractVariables((data.body_text ?? "") + (data.subject ?? "")) } });
});

// POST /api/templates
router.post("/", async (c) => {
  const db = c.get("db"); const user = c.get("user"); const workspaceId = c.get("workspaceId");
  const body = await c.req.json() as { name: string; slug: string; channels: string[]; subject?: string; body_text: string; body_html?: string; locale?: string; workspace_branding?: boolean; metadata?: Record<string, unknown> };
  if (!body.name || !body.body_text || !body.channels?.length) return c.json({ error: "name, body_text, channels required" }, 400);
  const validation = validateTemplate(body.subject ?? null, body.body_text);
  if (!validation.valid) return c.json({ error: "Template validation failed", details: validation.errors }, 422);
  const { data: existing } = await db.from("notification_templates").select("id").eq("workspace_id", workspaceId).eq("slug", body.slug).is("deleted_at", null).single();
  if (existing) return c.json({ error: "Template slug already exists in this workspace" }, 409);
  const { data, error } = await db.from("notification_templates").insert({ workspace_id: workspaceId, created_by: user.id, name: body.name, slug: body.slug, channels: body.channels, subject: body.subject ?? null, body_text: body.body_text, body_html: body.body_html ?? null, locale: body.locale ?? "en", version: 1, workspace_branding: body.workspace_branding ?? true, metadata: body.metadata ?? null }).select().single();
  if (error) return c.json({ error: error.message }, 500);
  await writeAuditLog(db, { workspaceId, userId: user.id, action: "template.created", resourceType: "notification_template", resourceId: data.id, status: "success", metadata: { name: body.name, channels: body.channels } });
  return c.json({ template: data }, 201);
});

// PATCH /api/templates/:id
router.patch("/:id", async (c) => {
  const db = c.get("db"); const user = c.get("user"); const workspaceId = c.get("workspaceId");
  const { data: current } = await db.from("notification_templates").select("*").eq("id", c.req.param("id")).eq("workspace_id", workspaceId).is("deleted_at", null).single();
  if (!current) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json() as Partial<{ name: string; channels: string[]; subject: string; body_text: string; body_html: string; locale: string; workspace_branding: boolean; metadata: Record<string, unknown> }>;
  const newBody = body.body_text ?? current.body_text;
  const newSubject = body.subject ?? current.subject;
  const validation = validateTemplate(newSubject, newBody);
  if (!validation.valid) return c.json({ error: "Template validation failed", details: validation.errors }, 422);
  // Archive current version in history
  await db.from("notification_template_versions").insert({ template_id: current.id, workspace_id: workspaceId, version: current.version, subject: current.subject, body_text: current.body_text, body_html: current.body_html, archived_by: user.id });
  const { data, error } = await db.from("notification_templates").update({ ...body, version: current.version + 1, updated_at: new Date().toISOString() }).eq("id", current.id).select().single();
  if (error) return c.json({ error: error.message }, 500);
  await writeAuditLog(db, { workspaceId, userId: user.id, action: "template.updated", resourceType: "notification_template", resourceId: current.id, status: "success" });
  return c.json({ template: data });
});

// DELETE /api/templates/:id — soft delete
router.delete("/:id", async (c) => {
  const db = c.get("db"); const user = c.get("user"); const workspaceId = c.get("workspaceId");
  const { data } = await db.from("notification_templates").select("id").eq("id", c.req.param("id")).eq("workspace_id", workspaceId).is("deleted_at", null).single();
  if (!data) return c.json({ error: "Not found" }, 404);
  await db.from("notification_templates").update({ deleted_at: new Date().toISOString() }).eq("id", data.id);
  await writeAuditLog(db, { workspaceId, userId: user.id, action: "template.deleted", resourceType: "notification_template", resourceId: data.id, status: "success" });
  return c.json({ ok: true });
});

// POST /api/templates/:id/preview
router.post("/:id/preview", async (c) => {
  const db = c.get("db"); const user = c.get("user"); const workspaceId = c.get("workspaceId");
  const { data: tmpl } = await db.from("notification_templates").select("*").eq("id", c.req.param("id")).eq("workspace_id", workspaceId).is("deleted_at", null).single();
  if (!tmpl) return c.json({ error: "Not found" }, 404);
  const { context = {} } = await c.req.json() as { context?: Record<string, string> };
  const rendered = renderNotification(tmpl.subject, tmpl.body_text, tmpl.body_html, context);
  await writeAuditLog(db, { workspaceId, userId: user.id, action: "template.previewed", resourceType: "notification_template", resourceId: tmpl.id, status: "success" });
  return c.json({ preview: rendered, variables: extractVariables((tmpl.body_text ?? "") + (tmpl.subject ?? "")) });
});

// GET /api/templates/:id/versions
router.get("/:id/versions", async (c) => {
  const db = c.get("db"); const workspaceId = c.get("workspaceId");
  const { data } = await db.from("notification_template_versions").select("*").eq("template_id", c.req.param("id")).eq("workspace_id", workspaceId).order("version", { ascending: false });
  return c.json({ versions: data ?? [] });
});

export default router;
