# WIZMAC — rald-notify
> RALD Notify — Notification Platform
> Last updated: 2026-06-17 — LILCKY STUDIO LIMITED

---

## 1. Product Overview
**rald-notify** is the unified notification delivery engine for the RALD ecosystem. It handles email, SMS, push, and in-app notifications for all products. Producers call it with a template + context; it handles rendering and multi-channel delivery.

| Field | Value |
|-------|-------|
| Live URL | `https://notification.rald.cloud` |
| Repo | `Ostinato-Loop/rald-notify` |
| Stack | Cloudflare Worker (Hono) |
| Database | Supabase `onxdcikfttdmnhofsuwo.supabase.co` |
| Email | Resend (`RESEND_API_KEY`) |
| SMS | Termii / Twilio |

---

## 2. Architecture
| Layer | Stack | Deployment |
|-------|-------|------------|
| API Worker | Cloudflare Worker (Hono) | `notification.rald.cloud` |
| Scheduled | Cloudflare Cron (`scheduled()`) | Retry failed deliveries |
| Database | Supabase PostgreSQL | Shared instance |
| Email | Resend API | `RESEND_API_KEY` |
| SMS | Termii or Twilio | Optional |
| Push | Web Push (VAPID) | Optional |

---

## 3. Auth Flow
```
1. Internal calls: X-Internal-Secret or X-RALD-Signature (HMAC)
2. Workspace API calls: Authorization: Bearer <RALD_JWT> + X-Workspace-ID
3. POST /internal/mailboxes/provision: X-Internal-Secret (no user JWT)
4. POST /internal/audit-ingest: HMAC signature from event-bus
```

---

## 4. Database Schema
```sql
notification_templates (id, workspace_id, name, slug, channels, subject,
  body_text, body_html, locale, version, metadata, deleted_at, created_at)

notifications (id, workspace_id, template_id, recipient_id, recipient_email,
  recipient_phone, push_subscription, channels, context, rendered_subject,
  rendered_body, rendered_html, priority, status, idempotency_key,
  schedule_at, created_at, updated_at)

notification_deliveries (id, notification_id, workspace_id, channel, status,
  provider, external_id, attempted_at, retry_count, error, created_at)

notification_channels (id, workspace_id, channel_type, name, config,
  is_default, active, created_at, updated_at)

notification_preferences (workspace_id, user_id, channel, enabled,
  digest_frequency, critical_override, event_filters, created_at, updated_at)

notification_events (id, workspace_id, name, slug, description,
  default_channels, template_id, deleted_at, created_at)

notification_audit_log (id, workspace_id, user_id, action, resource_type,
  resource_id, ip_address, user_agent, status, metadata, created_at)

-- Notification Center (supabase-notification-center.sql)
notification_types (id, product, name, display_name, description, icon,
  deep_link_template, is_system, can_disable, default_channels, created_at)
  -- 15 types seeded (loop, messenger, identity, system)
```

---

## 5. Key Environment Variables
| Variable | Required | Set In |
|----------|----------|--------|
| `SUPABASE_URL` | ✅ | Cloudflare secret |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ ⚠️ ROTATE | Cloudflare secret |
| `RALD_JWT_SECRET` | ✅ | Cloudflare secret |
| `RESEND_API_KEY` | ✅ | Cloudflare secret |
| `RALD_INTERNAL_SECRET` | ✅ | Cloudflare secret |
| `TERMII_API_KEY` | Optional | Cloudflare secret |
| `TWILIO_ACCOUNT_SID` | Optional | Cloudflare secret |
| `VAPID_PUBLIC_KEY` | Optional | Cloudflare secret |
| `RATE_LIMIT_KV` | Optional | KV namespace binding |

---

## 6. Live Endpoints
| Method | Path | Auth | Status |
|--------|------|------|--------|
| GET | `/health` | None | ✅ |
| POST | `/internal/mailboxes/provision` | `X-Internal-Secret` | ✅ New |
| POST | `/internal/audit-ingest` | HMAC | ✅ |
| GET | `/api/notifications` | JWT | ✅ |
| POST | `/api/notifications` | JWT | ✅ |
| GET | `/api/templates` | JWT | ✅ |
| POST | `/api/templates` | JWT | ✅ |
| GET | `/api/preferences` | JWT | ✅ |
| PATCH | `/api/preferences` | JWT | ✅ |
| GET | `/api/channels` | JWT | ✅ |
| GET | `/api/deliveries` | JWT | ✅ |
| GET | `/api/audit` | Admin JWT | ✅ |

---

## 7. CI Pipelines
| Workflow | Trigger | Status |
|----------|---------|--------|
| CI | Push/PR to main | ✅ Green |
| Deploy | Push to main | ✅ Green |

---

## 8. Incidents
| # | Date | Description | Status |
|---|------|-------------|--------|
| N-001 | 2026-06-17 | Notification DB tables not applied to Supabase | ⚠️ SQL ready (supabase-schema.sql) |
| N-002 | 2026-06-17 | POST /internal/mailboxes/provision endpoint added | ✅ Deployed |
