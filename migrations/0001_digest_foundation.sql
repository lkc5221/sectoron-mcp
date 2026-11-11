-- SECTORON daily digest foundation (not activated).
-- Apply via a reviewed D1 migration only after choosing the delivery channel.
-- No existing Worker bindings or schedules are changed by this file.

CREATE TABLE IF NOT EXISTS digest_subscriptions (
  id TEXT PRIMARY KEY,
  destination TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email')),
  locale TEXT NOT NULL DEFAULT 'ja' CHECK (locale IN ('ja', 'ko')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'unsubscribed')),
  topics_json TEXT NOT NULL CHECK (json_valid(topics_json)),
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  last_delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  activated_at TEXT,
  unsubscribed_at TEXT,
  CHECK (status <> 'active' OR activated_at IS NOT NULL),
  UNIQUE (channel, destination)
);

CREATE TABLE IF NOT EXISTS digest_delivery_runs (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES digest_subscriptions(id),
  digest_date_jst TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  article_urls_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(article_urls_json)),
  provider_message_id TEXT,
  error_message TEXT,
  attempted_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (subscription_id, digest_date_jst)
);

CREATE INDEX IF NOT EXISTS idx_digest_subscriptions_status
  ON digest_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_digest_delivery_runs_status
  ON digest_delivery_runs(status, digest_date_jst);
