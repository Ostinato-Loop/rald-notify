// RALD Notify — Notification Platform — LILCKY STUDIO LIMITED
// notification.rald.cloud
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { JwtPayload } from "./lib/auth";
import healthRoutes from "./routes/health";
import notificationsRoutes from "./routes/notifications";
import templatesRoutes from "./routes/templates";
import preferencesRoutes from "./routes/preferences";
import channelsRoutes from "./routes/channels";
import deliveriesRoutes from "./routes/deliveries";
import eventsRoutes from "./routes/events";
import auditRoutes from "./routes/audit";

export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RALD_JWT_SECRET: string;
  RESEND_API_KEY: string;
  TERMII_API_KEY?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  ENVIRONMENT?: string;
  RATE_LIMIT_KV?: KVNamespace;
};

export type Variables = {
  db: SupabaseClient;
  user: JwtPayload;
  workspaceId: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use("*", cors({
  origin: [
    "https://rald.cloud", "https://app.rald.cloud", "https://admin.rald.cloud",
    "https://control.rald.cloud", "https://business.rald.cloud",
    "https://messenger.rald.cloud", "https://loop.rald.cloud",
    "https://pay.rald.cloud", "https://dispatch.rald.cloud",
    "http://localhost:5173", "http://localhost:3000", "http://localhost:5174",
  ],
  allowHeaders: ["Authorization", "Content-Type", "X-Workspace-ID", "X-Request-ID", "X-RALD-SDK"],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
}));

app.use("*", async (c, next) => {
  c.set("db", createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY));
  await next();
});

// Health (public)
app.route("/", healthRoutes);

// API Routes
app.route("/api/notifications", notificationsRoutes);
app.route("/api/templates",     templatesRoutes);
app.route("/api/preferences",   preferencesRoutes);
app.route("/api/channels",      channelsRoutes);
app.route("/api/deliveries",    deliveriesRoutes);
app.route("/api/events",        eventsRoutes);
app.route("/api/audit",         auditRoutes);

// Scheduled trigger — process queued retries
export default {
  async fetch(req: Request, env: Bindings, ctx: ExecutionContext) {
    return app.fetch(req, env, ctx);
  },
  async scheduled(_event: ScheduledEvent, env: Bindings, _ctx: ExecutionContext) {
    // Process notifications that are queued for retry or scheduled delivery
    const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date().toISOString();
    // Pick up scheduled notifications that are due
    const { data: scheduled } = await db.from("notifications")
      .select("id,workspace_id,channels,rendered_subject,rendered_body,rendered_html,recipient_email,recipient_phone,push_subscription")
      .eq("status", "queued")
      .lte("schedule_at", now)
      .limit(50);
    if (scheduled?.length) {
      console.log(`[rald-notify] Scheduled trigger: processing ${scheduled.length} notifications`);
    }
    // Pick up failed deliveries eligible for retry (retry_count < 5, last attempt > 5min ago)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: retries } = await db.from("notification_deliveries")
      .select("id,notification_id,channel,retry_count")
      .eq("status", "failed")
      .lt("retry_count", 5)
      .lt("attempted_at", fiveMinAgo)
      .limit(100);
    if (retries?.length) {
      console.log(`[rald-notify] Scheduled trigger: ${retries.length} deliveries eligible for retry`);
    }
  },
};
