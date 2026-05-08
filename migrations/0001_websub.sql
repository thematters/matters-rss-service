CREATE TABLE IF NOT EXISTS websub_subscriptions (
  topic TEXT NOT NULL,
  callback TEXT NOT NULL,
  secret TEXT,
  lease_seconds INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_verified_at TEXT,
  last_error TEXT,
  PRIMARY KEY (topic, callback)
);

CREATE INDEX IF NOT EXISTS idx_websub_subscriptions_topic_expires
  ON websub_subscriptions(topic, expires_at);

CREATE TABLE IF NOT EXISTS websub_topics (
  topic TEXT PRIMARY KEY,
  latest_guid TEXT,
  checked_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS websub_usage (
  usage_date TEXT PRIMARY KEY,
  checks INTEGER NOT NULL DEFAULT 0,
  deliveries INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS websub_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL,
  callback TEXT NOT NULL,
  guid TEXT,
  status TEXT NOT NULL,
  status_code INTEGER,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_websub_deliveries_topic_created
  ON websub_deliveries(topic, created_at);
