// RALD Notify — Health Routes — LILCKY STUDIO LIMITED
import { Hono } from "hono";
import type { Bindings, Variables } from "../index";

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const healthResponse = (c: any) => c.json({
  status: "ok", service: "rald-notify", version: "1.0.0",
  environment: c.env.ENVIRONMENT ?? "production",
  owner: "LILCKY STUDIO LIMITED",
  timestamp: new Date().toISOString(),
  channels: { email: true, sms: true, push: true, webhook: true },
  planned_channels: ["messenger", "whatsapp", "instagram", "facebook"],
});

router.get("/health", healthResponse);
router.get("/api/health", healthResponse);
router.get("/healthz", healthResponse);
router.get("/api/healthz", healthResponse);
router.get("/ready", (c) => c.json({ ready: true, service: "rald-notify", checks: { supabase: !!c.env.SUPABASE_URL, resend: !!c.env.RESEND_API_KEY, termii: !!c.env.TERMII_API_KEY, vapid: !!c.env.VAPID_PUBLIC_KEY }, timestamp: new Date().toISOString() }));

export default router;
