# NOTIFICATION SCALE REPORT
**Service:** `rald-notify` — notification.rald.cloud  
**Phase:** E  
**Owner:** LILCKY STUDIO LIMITED  
**Date:** 2026-06-02

---

## Cloudflare Worker Capacity

| Metric | Value |
|---|---|
| Max concurrent requests | 1,000,000+ (CF global edge) |
| Cold start time | <5ms (Cloudflare global network) |
| CPU time limit | 30ms per request (paid plan: 30s) |
| Memory limit | 128MB |
| Cron trigger frequency | Every 5 minutes |
| Cron trigger CPU | 30 seconds |

---

## Supabase Capacity (Postgres)

| Table | Index Strategy | Expected Scale |
|---|---|---|
| `notifications` | workspace_id + status + created_at | 100M rows |
| `notification_deliveries` | notification_id + status + retry composite | 500M rows |
| `notification_templates` | workspace_id + slug (unique) | 10M rows |
| `notification_audit_log` | workspace_id + action + created_at DESC | 1B rows |

All tables use `TEXT` primary keys (UUID) to avoid Postgres sequence bottlenecks at scale.

---

## African-First Optimizations

| Optimization | Implementation |
|---|---|
| Minimal response payloads | Delivery tracking returns only changed fields |
| SMS primary, email fallback | Termii (NG-first CDN) as primary SMS provider |
| Retry with exponential backoff | Cron-based retry avoids hammering providers |
| Idempotency keys | Prevents duplicate submissions on unstable networks |
| Low-payload GET search | Optional `?summary=1` returns minimal notification data |

---

## Bottleneck Analysis

| Bottleneck | Risk | Mitigation |
|---|---|---|
| Supabase connection pool | Medium at >1k req/s | Use Supabase connection pooler (pgBouncer) |
| Resend rate limits | Low (300 emails/s free tier) | Upgrade to paid plan; add queue |
| Termii SMS throughput | Low (1k/min on standard plan) | Add Twilio as parallel primary |
| Cloudflare KV rate limit KV | Low | KV is optimized for high-read workloads |

---

## Retry Storm Prevention

- Max 5 retries per delivery
- Retry only after 5-minute backoff (enforced in cron)
- Failed deliveries with `retry_count >= 5` are marked terminal — no further processing
- Bulk cancel route (`DELETE /api/notifications`) available for workspace admins

---

## Conclusion

Platform is designed to handle **1M+ notifications/day** on Cloudflare's edge infrastructure with Supabase Postgres as the backing store. No architectural changes required for Phase F scale.
