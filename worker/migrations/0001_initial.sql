PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
  google_subject TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  drive_folder_id TEXT,
  migration_completed_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  google_subject TEXT NOT NULL REFERENCES accounts(google_subject) ON DELETE CASCADE,
  client_type TEXT NOT NULL CHECK (client_type IN ('web', 'android')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_by_owner
  ON sessions(google_subject, expires_at);

CREATE TABLE IF NOT EXISTS drive_credentials (
  google_subject TEXT PRIMARY KEY REFERENCES accounts(google_subject) ON DELETE CASCADE,
  refresh_token_ciphertext TEXT NOT NULL,
  refresh_token_iv TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchases (
  purchase_token_hash TEXT PRIMARY KEY,
  google_subject TEXT NOT NULL REFERENCES accounts(google_subject) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  purchase_state TEXT NOT NULL CHECK (
    purchase_state IN ('PURCHASED', 'PENDING', 'CANCELED', 'INVALID', 'REFUNDED')
  ),
  purchase_token_ciphertext TEXT NOT NULL,
  purchase_token_iv TEXT NOT NULL,
  acknowledged INTEGER NOT NULL DEFAULT 0,
  play_purchase_time TEXT,
  last_verified_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS purchases_by_owner
  ON purchases(google_subject, purchase_state);

CREATE TABLE IF NOT EXISTS entitlements (
  google_subject TEXT PRIMARY KEY REFERENCES accounts(google_subject) ON DELETE CASCADE,
  cloud_sync_status TEXT NOT NULL CHECK (
    cloud_sync_status IN ('active', 'pending', 'invalid', 'canceled', 'refunded')
  ),
  source_purchase_token_hash TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drawings (
  google_subject TEXT NOT NULL REFERENCES accounts(google_subject) ON DELETE CASCADE,
  drawing_id TEXT NOT NULL,
  drive_file_id TEXT NOT NULL,
  drive_revision_id TEXT,
  client_updated_at TEXT NOT NULL,
  migrated_from_file_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (google_subject, drawing_id),
  UNIQUE (google_subject, drive_file_id)
);

CREATE INDEX IF NOT EXISTS drawings_by_file
  ON drawings(google_subject, drive_file_id);

CREATE TABLE IF NOT EXISTS migration_sources (
  google_subject TEXT NOT NULL REFERENCES accounts(google_subject) ON DELETE CASCADE,
  source_file_id TEXT NOT NULL,
  drawing_id TEXT,
  destination_file_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('copied', 'already-present', 'rejected')),
  reason_code TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (google_subject, source_file_id)
);

CREATE TABLE IF NOT EXISTS play_rtdn_messages (
  message_id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL
);
