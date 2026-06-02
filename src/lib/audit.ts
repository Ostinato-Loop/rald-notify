// RALD Notify — Audit Logging — LILCKY STUDIO LIMITED
import { SupabaseClient } from "@supabase/supabase-js";

export type NotifyAuditAction =
  | "notification.created" | "notification.queued" | "notification.cancelled"
  | "delivery.attempted" | "delivery.succeeded" | "delivery.failed" | "delivery.retried"
  | "delivery.opened" | "delivery.clicked"
  | "template.created" | "template.updated" | "template.deleted" | "template.previewed"
  | "preference.updated" | "channel.configured" | "channel.disabled"
  | "event.registered" | "search.performed"
  | "admin.bulk_cancel" | "admin.requeue";

export interface AuditEntry {
  workspaceId?: string | null;
  userId?: string | null;
  action: NotifyAuditAction;
  resourceType?: string;
  resourceId?: string;
  ip?: string;
  userAgent?: string;
  status?: "success" | "failure" | "blocked";
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(db: SupabaseClient, entry: AuditEntry): Promise<void> {
  try {
    await db.from("notification_audit_log").insert({
      workspace_id: entry.workspaceId ?? null,
      user_id: entry.userId ?? null,
      action: entry.action,
      resource_type: entry.resourceType ?? null,
      resource_id: entry.resourceId ?? null,
      ip_address: entry.ip ?? null,
      user_agent: entry.userAgent ?? null,
      status: entry.status ?? "success",
      metadata: entry.metadata ?? null,
    });
  } catch (err) {
    console.warn("[notify-audit] write failed:", err);
  }
}
