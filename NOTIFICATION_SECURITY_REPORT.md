# NOTIFICATION SECURITY REPORT
**Service:** `rald-notify` — notification.rald.cloud  
**Phase:** E  
**Owner:** LILCKY STUDIO LIMITED  
**Date:** 2026-06-02  
**Severity Summary:** 0 CRITICAL · 0 HIGH · 1 MEDIUM · 2 LOW

---

## Security Controls

| Control | Implementation | Status |
|---|---|---|
| Authentication | RALD JWT (HS256) — Bearer token required on all routes | ✅ |
| Authorization | RBAC — admin/operator required for write operations | ✅ |
| Workspace isolation | `workspace_id` enforced at query level on every table | ✅ |
| Rate limiting | Cloudflare KV — 60 req/min per user/workspace | ✅ |
| Webhook signing | HMAC-SHA256 signature on every webhook delivery | ✅ |
| Idempotency | Unique key prevents duplicate notification creation | ✅ |
| Audit trail | Every operation logged to `notification_audit_log` | ✅ |
| Provider secrets | Stored as Cloudflare Worker secrets, never in code | ✅ |
| CORS | Whitelist-only, credentials: true | ✅ |
| Input validation | Channel, priority, template existence validated before insert | ✅ |
| Notification abuse prevention | Rate limit on creation; idempotency key enforcement | ✅ |
| Retry cap | Max 5 retries per delivery — prevents retry storms | ✅ |
| Push subscription privacy | Subscription stored in JSONB, never logged in plaintext | ✅ |

---

## Findings

### MEDIUM — No webhook URL validation
**Description:** Webhook URLs are stored without validation of scheme or SSRF risk.  
**Risk:** An attacker with admin access could configure a webhook to internal IP ranges.  
**Mitigation:** Add URL allowlist validation (https-only, no RFC1918 ranges) before storing channel config.  
**Status:** Open — to be resolved in Phase E.1 hardening sprint.

### LOW — Resend API key rotation
**Description:** RESEND_API_KEY is a long-lived secret with no automated rotation.  
**Risk:** If leaked, all email notifications could be sent without authorization.  
**Mitigation:** Implement 90-day rotation policy; alert on anomalous send volume.  
**Status:** Accepted — documented.

### LOW — Push subscription expiry not enforced
**Description:** Expired push subscriptions (HTTP 410) are not automatically purged from the database.  
**Risk:** Accumulation of invalid subscriptions.  
**Mitigation:** On 410 response from push provider, mark subscription as expired. Batch purge job recommended.  
**Status:** Accepted — to be implemented in Phase F.

---

## No CRITICAL or HIGH Findings

Phase F authorization is **not blocked** by this report.
