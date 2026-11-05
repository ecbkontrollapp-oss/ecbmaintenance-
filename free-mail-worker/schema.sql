-- Cloudflare D1 free-tier idempotency log. No passwords, JWTs, PDFs or photo data stored.
CREATE TABLE IF NOT EXISTS mail_jobs (
  job_id TEXT PRIMARY KEY,
  protocol_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  source_path TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('automatic', 'manual')),
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','sent','needs-review')),
  provider_id TEXT,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_mail_jobs_recipient_time
  ON mail_jobs (recipient, created_at);
CREATE INDEX IF NOT EXISTS idx_mail_jobs_protocol_time
  ON mail_jobs (protocol_id, recipient, created_at);
