-- RALD Notify — Ecosystem Notification Center Schema
-- Sprint: Operator Platform Phase 7 · 2026-06-12
-- Unified notification center — one source for all products.
-- Producers: Loop, Messenger, Mail, Business, Identity, AI, System
-- User receives consolidated notification feed.
-- LILCKY STUDIO LIMITED

-- ── notification_types — registry of all notification types ──────────────────
CREATE TABLE IF NOT EXISTS notification_types (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product      TEXT NOT NULL,       -- loop, messenger, mail, business, identity, ai, system
  name         TEXT NOT NULL,       -- e.g. "room_started", "new_message", "verification_approved"
  display_name TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  icon         TEXT,                -- emoji or icon key
  deep_link_template TEXT,          -- e.g. "loop://room/{room_id}"
  is_system    BOOLEAN NOT NULL DEFAULT false,
  can_disable  BOOLEAN NOT NULL DEFAULT true,   -- system notifications cannot be disabled
  default_channels TEXT[] NOT NULL DEFAULT ARRAY['in_app'],  -- in_app, push, sms, email
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_types_product_name_idx
  ON notification_types(product, name);

ALTER TABLE notification_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_types: public read"
  ON notification_types FOR SELECT USING (true);
CREATE POLICY "notification_types: service write"
  ON notification_types FOR ALL USING (true) WITH CHECK (true);

-- ── Seed: Core notification types ────────────────────────────────────────────
INSERT INTO notification_types (product, name, display_name, description, icon, default_channels) VALUES
  -- Loop
  ('loop', 'room_started',      'Room Started',         'A host you follow started a room', '🎙️', ARRAY['push','in_app']),
  ('loop', 'room_invite',       'Room Invite',          'You were invited to join a room', '🎙️', ARRAY['push','in_app']),
  ('loop', 'community_update',  'Community Update',     'New activity in your community', '🏘️', ARRAY['in_app']),
  ('loop', 'community_joined',  'Community Joined',     'Someone joined your community', '🏘️', ARRAY['in_app']),
  ('loop', 'follow',            'New Follower',         'Someone followed you', '👤', ARRAY['in_app','push']),
  ('loop', 'civic_room_starts', 'Civic Room Starting',  'A scheduled civic discussion starts soon', '🏛️', ARRAY['push','in_app','sms']),
  -- Messenger
  ('messenger', 'new_message',  'New Message',          'You have a new direct message', '💬', ARRAY['push','in_app']),
  ('messenger', 'missed_call',  'Missed Call',          'You missed a call', '📞', ARRAY['push','in_app']),
  ('messenger', 'group_invite', 'Group Invite',         'You were added to a group', '👥', ARRAY['push','in_app']),
  -- Identity
  ('identity', 'verification_approved', 'Verification Approved', 'Your identity verification was approved', '✅', ARRAY['push','in_app','email']),
  ('identity', 'verification_rejected', 'Verification Rejected', 'Your identity verification needs attention', '⚠️', ARRAY['push','in_app','email']),
  ('identity', 'trust_upgraded',        'Trust Level Updated',   'Your trust level has increased', '⭐', ARRAY['in_app']),
  ('identity', 'security_alert',        'Security Alert',        'New login from unrecognized device', '🔐', ARRAY['push','in_app','sms','email']),
  -- System
  ('system', 'account_suspended', 'Account Suspended', 'Your account has been suspended', '🚫', ARRAY['push','in_app','email']),
  ('system', 'welcome',          'Welcome to RALD',    'Welcome to the RALD ecosystem', '🎉', ARRAY['push','in_app','email'])
ON CONFLICT (product, name) DO NOTHING;

-- ── notification_preferences — per-user channel preferences ──────────────────
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id          UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  product          TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  in_app_enabled   BOOLEAN NOT NULL DEFAULT true,
  push_enabled     BOOLEAN NOT NULL DEFAULT true,
  sms_enabled      BOOLEAN NOT NULL DEFAULT false,
  email_enabled    BOOLEAN NOT NULL DEFAULT false,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product, notification_type)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_preferences: own"
  ON notification_preferences FOR ALL USING (user_id = auth.uid());
CREATE POLICY "notification_preferences: service"
  ON notification_preferences FOR ALL USING (true) WITH CHECK (true);

-- ── notification_center — the unified notification feed ───────────────────────
CREATE TABLE IF NOT EXISTS notification_center (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,

  -- Origin
  product         TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  
  -- Content
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  icon            TEXT,
  image_url       TEXT,
  deep_link       TEXT,     -- e.g. "loop://room/abc123"
  web_url         TEXT,     -- e.g. "https://loop.rald.cloud/room/abc123"
  
  -- Context
  actor_id        UUID,     -- user who triggered this (follower, room host, etc.)
  entity_id       TEXT,     -- room_id, message_id, community_id, etc.
  entity_type     TEXT,     -- "room", "message", "community", etc.
  metadata        JSONB NOT NULL DEFAULT '{}',

  -- Delivery
  channels_sent   TEXT[] NOT NULL DEFAULT '{}',  -- which channels were sent
  read_at         TIMESTAMPTZ,
  archived_at     TIMESTAMPTZ,
  
  -- Grouping
  group_key       TEXT,     -- collapse similar notifications (e.g. "follows" group)
  group_count     INTEGER NOT NULL DEFAULT 1,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_center_user_unread_idx
  ON notification_center(user_id, read_at, created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS notification_center_user_all_idx
  ON notification_center(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_center_group_key_idx
  ON notification_center(user_id, group_key, created_at DESC)
  WHERE group_key IS NOT NULL;

ALTER TABLE notification_center ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_center: own"
  ON notification_center FOR ALL USING (user_id = auth.uid());
CREATE POLICY "notification_center: service write"
  ON notification_center FOR INSERT WITH CHECK (true);

-- ── push_tokens — per-device push notification tokens ────────────────────────
CREATE TABLE IF NOT EXISTS push_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  device_id   TEXT NOT NULL,
  platform    TEXT NOT NULL CHECK (platform IN ('ios','android','web')),
  token       TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  last_used   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS push_tokens_user_active_idx ON push_tokens(user_id, is_active)
  WHERE is_active = true;

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_tokens: own" ON push_tokens FOR ALL USING (user_id = auth.uid());
CREATE POLICY "push_tokens: service" ON push_tokens FOR ALL USING (true) WITH CHECK (true);
