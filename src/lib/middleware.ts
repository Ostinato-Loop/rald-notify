// RALD Notify — Middleware — LILCKY STUDIO LIMITED
import type { Context, Next } from "hono";
import { verifyJwt } from "./auth";
import type { Bindings, Variables } from "../index";

export async function authMiddleware(
  c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next
): Promise<Response | void> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return c.json({ error: "Missing or invalid authorization header" }, 401);
  const payload = await verifyJwt(authHeader.slice(7), c.env.RALD_JWT_SECRET);
  if (!payload) return c.json({ error: "Invalid or expired token" }, 401);
  c.set("user", payload);
  await next();
}

export async function adminMiddleware(
  c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next
): Promise<Response | void> {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (!["admin", "operator"].includes(user.role)) return c.json({ error: "Insufficient permissions" }, 403);
  await next();
}

export async function workspaceMiddleware(
  c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next
): Promise<Response | void> {
  const workspaceId = c.req.header("X-Workspace-ID") ?? c.req.query("workspace_id");
  if (!workspaceId) return c.json({ error: "X-Workspace-ID header required" }, 400);
  c.set("workspaceId", workspaceId);
  await next();
}
