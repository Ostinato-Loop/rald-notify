// RALD Notify — Notifications Routes — LILCKY STUDIO LIMITED
import { Hono } from "hono";
import type { Bindings, Variables } from "../index";
import { authMiddleware, workspaceMiddleware } from "../lib/middleware";
import { writeAuditLog } from "../lib/audit";
import { renderNotification, extractVariables } from "../lib/template";
import { sendEmail } from "../lib/channels/email";
import { sendSms } from "../lib/channels/sms";
import { sendWebhook } from "../lib/channels/webhook";

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();
router.use("*", authMiddleware, workspaceMiddleware);

// POST /api/notifications — create + queue a notification
router.post("/", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const workspaceId = c.get("workspaceId");
  const body = await c.req.json() as {
    template_id?: string;
    recipient_id?: string;
    recipient_email?: string;
    recipient_phone?: string;
    push_subscription?: { endpoint: string; p256dh: string; auth: string };
    channels: string[];
    context?: Record<string, string>;
    schedule_at?: string;
    priority?: string;
    idempotency_key?: string;
  };

  if (!body.channels?.length) return c.json({ error: "channels required" }, 400);
  if (!body.recipient_id && !body.recipient_email && !body.recipient_phone) {
    return c.json({ error: "At least one recipient identifier required" }, 400);
  }

  // Idempotency check
  if (body.idempotency_key) {
    const { data: existing } = await db.from("notifications")
      .select("id,status").eq("idempotency_key", body.idempotency_key)
      .eq("workspace_id", workspaceId).single();
    if (existing) return c.json({ notification: existing, idempotent: true }, 200);
  }

  // Resolve template
  let subject: string | null = null, bodyText = "", bodyHtml: string | null = null;
  if (body.template_id) {
    const { data: tmpl } = await db.from("notification_templates")
      .select("subject,body_text,body_html").eq("id", body.template_id)
      .eq("workspace_id", workspaceId).single();
    if (!tmpl) return c.json({ error: "Template not found" }, 404);
    const rendered = renderNotification(tmpl.subject, tmpl.body_text, tmpl.body_html, body.context ?? {});
    subject = rendered.subject ?? null; bodyText = rendered.body; bodyHtml = rendered.html ?? null;
  } else {
    return c.json({ error: "template_id required" }, 400);
  }

  // Insert notification record
  const { data: notif, error } = await db.from("notifications").insert({
    workspace_id: workspaceId,
    template_id: body.template_id,
    recipient_id: body.recipient_id ?? null,
    recipient_email: body.recipient_email ?? null,
    recipient_phone: body.recipient_phone ?? null,
    push_subscription: body.push_subscription ?? null,
    channels: body.channels,
    context: body.context ?? {},
    rendered_subject: subject,
    rendered_body: bodyText,
    rendered_html: bodyHtml,
    priority: body.priority ?? "normal",
    status: "queued",
    idempotency_key: body.idempotency_key ?? null,
    schedule_at: body.schedule_at ?? null,
    created_by: user.id,
  }).select().single();

  if (error || !notif) return c.json({ error: error?.message ?? "Failed to create notification" }, 500);

  await writeAuditLog(db, {
    workspaceId, userId: user.id,
    action: "notification.created", resourceType: "notification", resourceId: notif.id,
    status: "success", metadata: { channels: body.channels, priority: body.priority },
  });

  // Immediate dispatch (non-scheduled)
  if (!body.schedule_at) {
    c.executionCtx.waitUntil(dispatchNotification(c, notif.id, workspaceId, body.channels, subject, bodyText, bodyHtml, body));
  }

  return c.json({ notification: notif }, 201);
});

async function dispatchNotification(c: any, notifId: string, workspaceId: string, channels: string[], subject: string | null, bodyText: string, bodyHtml: string | null, body: any) {
  const db = c.get("db");
  for (const channel of channels) {
    const start = Date.now();
    let success = false; let providerId: string | undefined; let errorMsg: string | undefined; let latency = 0;

    try {
      if (channel === "email" && body.recipient_email) {
        const r = await sendEmail(c.env.RESEND_API_KEY, { to: body.recipient_email, subject: subject ?? "(no subject)", text: bodyText, html: bodyHtml ?? undefined });
        success = r.success; providerId = r.providerId; errorMsg = r.errorMessage; latency = r.latencyMs;
      } else if (channel === "sms" && body.recipient_phone) {
        const r = await sendSms(c.env.TERMII_API_KEY, c.env.TWILIO_ACCOUNT_SID, c.env.TWILIO_AUTH_TOKEN, c.env.TWILIO_FROM_NUMBER, { to: body.recipient_phone, message: bodyText });
        success = r.success; providerId = r.providerId; errorMsg = r.errorMessage; latency = r.latencyMs;
      } else if (channel === "webhook") {
        const { data: wh } = await db.from("notification_channels").select("config").eq("workspace_id", workspaceId).eq("channel_type", "webhook").single();
        if (wh?.config?.url) {
          const r = await sendWebhook({ url: wh.config.url, secret: wh.config.secret, event: "notification.sent", notificationId: notifId, workspaceId, data: { subject, body: bodyText } });
          success = r.success; errorMsg = r.errorMessage; latency = r.latencyMs;
        }
      }
    } catch (err) { errorMsg = String(err); }

    await db.from("notification_deliveries").insert({
      notification_id: notifId, workspace_id: workspaceId, channel,
      status: success ? "delivered" : "failed",
      provider_id: providerId ?? null, provider_latency_ms: latency,
      error_message: errorMsg ?? null, attempted_at: new Date().toISOString(),
    });
  }

  const allDeliveries = await db.from("notification_deliveries").select("status").eq("notification_id", notifId);
  const anySuccess = allDeliveries.data?.some((d: any) => d.status === "delivered");
  await db.from("notifications").update({ status: anySuccess ? "delivered" : "failed", updated_at: new Date().toISOString() }).eq("id", notifId);
}

// GET /api/notifications — list notifications for workspace
router.get("/", async (c) => {
  const db = c.get("db");
  const workspaceId = c.get("workspaceId");
  const { status, channel, page = "1", limit = "20" } = c.req.query();
  const offset = (parseInt(page) - 1) * parseInt(limit);
  let query = db.from("notifications").select("*", { count: "exact" }).eq("workspace_id", workspaceId).order("created_at", { ascending: false }).range(offset, offset + parseInt(limit) - 1);
  if (status) query = query.eq("status", status);
  const { data, count, error } = await query;
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ notifications: data, total: count, page: parseInt(page), limit: parseInt(limit) });
});

// GET /api/notifications/:id
router.get("/:id", async (c) => {
  const db = c.get("db");
  const { data } = await db.from("notifications").select("*, notification_deliveries(*)").eq("id", c.req.param("id")).eq("workspace_id", c.get("workspaceId")).single();
  if (!data) return c.json({ error: "Not found" }, 404);
  return c.json({ notification: data });
});

// DELETE /api/notifications/:id — cancel queued
router.delete("/:id", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const workspaceId = c.get("workspaceId");
  const { data } = await db.from("notifications").select("id,status").eq("id", c.req.param("id")).eq("workspace_id", workspaceId).single();
  if (!data) return c.json({ error: "Not found" }, 404);
  if (data.status !== "queued") return c.json({ error: "Only queued notifications can be cancelled" }, 409);
  await db.from("notifications").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", data.id);
  await writeAuditLog(db, { workspaceId, userId: user.id, action: "notification.cancelled", resourceType: "notification", resourceId: data.id, status: "success" });
  return c.json({ ok: true });
});

export default router;
