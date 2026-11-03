-- Preserve historical audit rows; missing IP/username remains explicitly unknown.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS client_ip varchar(45) NOT NULL DEFAULT '';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_username varchar(24) NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS audits_ip ON audit_logs(client_ip, occurred_at DESC, id);
CREATE INDEX IF NOT EXISTS audits_username ON audit_logs(actor_username, occurred_at DESC, id);
