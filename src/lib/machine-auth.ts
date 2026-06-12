// RALD Notify — Machine Identity Middleware
// Sprint: Operator Platform Phase 9 · 2026-06-12
// rald-notify receives publish calls from all RALD products.
// Required scope: "notify:publish" (for POST /api/center/publish, POST /api/events/*).
// Backward-compatible: falls back to RALD_INTERNAL_SECRET during transition.
// LILCKY STUDIO LIMITED

import type { Context, Next } from "hono";
import type { Bindings, Variables } from "../index";

export interface MachineJwtPayload {
  type:             "machine";
  machine_id:       string;
  service_name:     string;
  scopes:           string[];
  allowed_services: string[];
  iat:              number;
  exp:              number;
}

async function verifyMachineJwt(
  token: string,
  secret: string
): Promise<MachineJwtPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts as [string, string, string];
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const sigBytes = Uint8Array.from(
      atob(sig.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0)
    );
    const valid = await crypto.subtle.verify(
      "HMAC", key, sigBytes,
      new TextEncoder().encode(`${header}.${body}`)
    );
    if (!valid) return null;
    const payload = JSON.parse(
      atob(body.replace(/-/g, "+").replace(/_/g, "/"))
    ) as MachineJwtPayload;
    if (payload.type !== "machine") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ── requireMachinePublish — validate caller can publish notifications ──────────
// Any registered RALD service with scope "notify:publish" can call /api/center/publish.
export function requireMachinePublish() {
  return async (
    c: Context<{ Bindings: Bindings; Variables: Variables }>,
    next: Next
  ) => {
    const env = c.env;

    // 1. Machine JWT (preferred)
    const tokenRaw = c.req.header("X-Machine-Token") ??
      (c.req.header("Authorization")?.startsWith("Bearer ")
        ? c.req.header("Authorization")!.slice(7) : null);

    if (tokenRaw) {
      const payload = await verifyMachineJwt(tokenRaw, env.RALD_JWT_SECRET);
      if (!payload) return c.json({ error: "Invalid or expired machine token" }, 401);
      if (!payload.scopes.includes("notify:publish")) {
        return c.json({ error: "Missing required scope: notify:publish" }, 403);
      }
      c.set("machine" as never, payload as never);
      return next();
    }

    // 2. Backward-compat: X-Internal-Secret (deprecated)
    const internalSecret = c.req.header("X-Internal-Secret");
    if (internalSecret && env.RALD_INTERNAL_SECRET && internalSecret === env.RALD_INTERNAL_SECRET) {
      console.warn("[rald-notify] DEPRECATED: X-Internal-Secret used — migrate to machine JWT");
      return next();
    }

    return c.json({ error: "Unauthorized — machine token required to publish notifications" }, 401);
  };
}

// ── requireMachineAuth — generic scope-based machine auth ─────────────────────
export function requireMachineAuth(requiredScope?: string) {
  return async (
    c: Context<{ Bindings: Bindings; Variables: Variables }>,
    next: Next
  ) => {
    const env = c.env;
    const tokenRaw = c.req.header("X-Machine-Token") ??
      (c.req.header("Authorization")?.startsWith("Bearer ")
        ? c.req.header("Authorization")!.slice(7) : null);

    if (tokenRaw) {
      const payload = await verifyMachineJwt(tokenRaw, env.RALD_JWT_SECRET);
      if (!payload) return c.json({ error: "Invalid or expired machine token" }, 401);
      if (requiredScope && !payload.scopes.includes(requiredScope)) {
        return c.json({ error: `Missing required scope: ${requiredScope}` }, 403);
      }
      c.set("machine" as never, payload as never);
      return next();
    }

    const internalSecret = c.req.header("X-Internal-Secret");
    if (internalSecret && env.RALD_INTERNAL_SECRET && internalSecret === env.RALD_INTERNAL_SECRET) {
      console.warn("[rald-notify] DEPRECATED: X-Internal-Secret used");
      return next();
    }

    return c.json({ error: "Unauthorized" }, 401);
  };
}
