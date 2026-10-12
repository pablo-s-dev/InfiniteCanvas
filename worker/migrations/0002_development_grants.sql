CREATE TABLE IF NOT EXISTS development_grants (
 google_subject TEXT PRIMARY KEY REFERENCES accounts(google_subject) ON DELETE CASCADE,
 email TEXT NOT NULL,
 reason TEXT NOT NULL,
 created_at TEXT NOT NULL
);
