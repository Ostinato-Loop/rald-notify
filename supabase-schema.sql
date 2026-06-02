-- ============================================================
-- RALD Notify — Supabase Schema v1.0
-- Notification Platform — Phase E
-- Owner: LILCKY STUDIO LIMITED
-- All statements idempotent (IF NOT EXISTS / OR REPLACE)
-- ============================================================

-- ── Notification Templates ───────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_templates (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id      TEXT NOT NULL,
  created_by        TEXT,
  name              TEXT NOT NULL,
  slug              TEXT NOT NULL,
  channels          JSONB NOT NULL DEFAULT '["email"]',
  subject           TEXT,
  body_text         TEXT NOT NULL,
  body_html         TEXT,
  locale            TEXT NOT NULL DEFAULT 'en',
  version           INTEGER NOT NULL DEFAULT 1,
  workspace_branding BOOLEAN NOT NULL DEFAULT TRUE,
  metadata          JSONB,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, slug)
);
CREATE INDEX IF NOT EXISTS notif_tmpl_workspace_idx ON notification_templates (workspace_id);
CREATE INDEX IF NOT EXISTS notif_tmpl_slug_idx      ON notification_templates (workspace_id, slug) WHERE deleted_at IS NULL;

-- ── Template Version History ──────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_template_versions (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  template_id TEXT NOT NULL REFERENCES notification_templates(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  version     INTEGER NOT NULL,
  subject     TEXT,
  body_text   TEXT NOT NULL,
  body_html   TEXT,
  archived_by TEXT,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notif_tmpl_ver_tmpl_idx ON notification_template_versions (template_id);

-- ── Notifications ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id      TEXT NOT NULL,
  template_id       TEXT REFERENCES notification_templates(id),
  created_by        TEXT,
  recipient_id      TEXT,
  recipient_email   TEXT,
  recipient_phone   TEXT,
  push_subscription JSONB,
  channels          JSONB NOT NULL DEFAULT '[]',
  context           JSONB NOT NULL DEFAULT '{}',
  rendered_subject  TEXT,
  rendered_body     TEXT NOT NULL DEFAULT '',
  rendered_html     TEXT,
  priority          TEXT NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('critical','high','normal','low')),
  status            TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','processing','delivered','failed','cancelled','scheduled')),
  idempotency_key   TEXT,
  schedule_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notif_workspace_idx       ON notifications (workspace_id);
CREATE INDEX IF NOT EXISTS notif_status_idx          ON notifications (workspace_id, status);
CREATE INDEX IF NOT EXISTS notif_recipient_idx       ON notifications (workspace_id, recipient_id);
CREATE INDEX IF NOT EXISTS notif_idempotency_idx     ON notifications (workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notif_schedule_idx        ON notifications (schedule_at) WHERE status = 'queued' AND schedule_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS notif_created_idx         ON notifications (created_at DESC);

-- ── Notification Deliveries ───────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  notification_id      TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  workspace_id         TEXT NOT NULL,
  channel              TEXT NOT NULL
                       CHECK (channel IN ('email','sms','push','webhook','messenger','whatsapp','instagram','facebook')),
  status               TEXT NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued','processing','delivered','failed','retried','opened','clicked')),
  provider_id          TEXT,
  provider_latency_ms  INTEGER,
  error_message        TEXT,
  retry_count          INTEGER NOT NULL DEFAULT 0,
  opened_at            TIMESTAMPTZ,
  clicked_at           TIMESTAMPTZ,
  clicked_url          TEXT,
  provider_response    JSONB,
  attempted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notif_del_notification_idx ON notification_deliveries (notification_id);
CREATE INDEX IF NOT EXISTS notif_del_workspace_idx    ON notification_deliveries (workspace_id);
CREATE INDEX IF NOT EXISTS notif_del_status_idx       ON notification_deliveries (status);
CREATE INDEX IF NOT EXISTS notif_del_channel_idx      ON notification_deliveries (workspace_id, channel);
CREATE INDEX IF NOT EXISTS notif_del_retry_idx        ON notification_deliveries (status, retry_count, attempted_at) WHERE status = 'failed' AND retry_count < 5;

-- ── Notification Channels (workspace config) ──────────────────
CREATE TABLE IF NOT EXISTS notification_channels (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id TEXT NOT NULL,
  channel_type TEXT NOT NULL
               CHECK (channel_type IN ('email','sms','push','webhook')),
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  config       JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, channel_type)
);
CREATE INDEX IF NOT EXISTS notif_chan_workspace_idx ON notification_channels (workspace_id);

-- ── Notification Preferences ──────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_preferences (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id     TEXT NOT NULL,
  user_id          TEXT,
  channel          TEXT,
  email_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  sms_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  webhook_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  muted            BOOLEAN NOT NULL DEFAULT FALSE,
  mute_until       TIMESTAMPTZ,
  digest_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  digest_frequency TEXT NOT NULL DEFAULT 'daily'
                   CHECK (digest_frequency IN ('realtime','hourly','daily','weekly')),
  critical_override BOOLEAN NOT NULL DEFAULT TRUE,
  event_filters    JSONB NOT NULL DEFAULT '[]',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, user_id, channel)
);
CREATE INDEX IF NOT EXISTS notif_pref_workspace_idx ON notification_preferences (workspace_id);
CREATE INDEX IF NOT EXISTS notif_pref_user_idx      ON notification_preferences (workspace_id, user_id);

-- ── Notification Events (registered event types) ──────────────
CREATE TABLE IF NOT EXISTS notification_events (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id     TEXT NOT NULL,
  created_by       TEXT,
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL,
  description      TEXT,
  default_channels JSONB NOT NULL DEFAULT '["email"]',
  template_id      TEXT REFERENCES notification_templates(id),
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, slug)
);
CREATE INDEX IF NOT EXISTS notif_evt_workspace_idx ON notification_events (workspace_id) WHERE deleted_at IS NULL;

-- ── Notification Audit Log ────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_audit_log (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id  TEXT,
  user_id       TEXT,
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  ip_address    TEXT,
  user_agent    TEXT,
  status        TEXT NOT NULL DEFAULT 'success'
                CHECK (status IN ('success','failure','blocked')),
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notif_audit_workspace_idx ON notification_audit_log (workspace_id);
CREATE INDEX IF NOT EXISTS notif_audit_action_idx    ON notification_audit_log (action);
CREATE INDEX IF NOT EXISTS notif_audit_created_idx   ON notification_audit_log (created_at DESC);

-- ── Disable RLS (service role key used from Worker) ───────────
ALTER TABLE notification_templates         DISABLE ROW LEVEL SECURITY;
ALTER TABLE notification_template_versions DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries        DISABLE ROW LEVEL SECURITY;
ALTER TABLE notification_channels          DISABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences       DISABLE ROW LEVEL SECURITY;
ALTER TABLE notification_events            DISABLE ROW LEVEL SECURITY;
ALTER TABLE notification_audit_log         DISABLE ROW LEVEL SECURITY;

-- ── Auto-update updated_at ────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'notif_templates_updated_at') THEN
    CREATE TRIGGER notif_templates_updated_at BEFORE UPDATE ON notification_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'notifications_updated_at') THEN
    CREATE TRIGGER notifications_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'notif_deliveries_updated_at') THEN
    CREATE TRIGGER notif_deliveries_updated_at BEFORE UPDATE ON notification_deliveries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'notif_channels_updated_at') THEN
    CREATE TRIGGER notif_channels_updated_at BEFORE UPDATE ON notification_channels FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'notif_prefs_updated_at') THEN
    CREATE TRIGGER notif_prefs_updated_at BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- NOTE: Owner: LILCKY STUDIO LIMITED. Phase E — Notification Platform.
