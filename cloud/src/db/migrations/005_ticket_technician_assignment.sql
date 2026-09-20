-- Additive only: existing tickets remain unassigned until explicitly sent by Main.
-- No machine, QR, GPS, ticket status or baseline data changes.
ALTER TABLE cloud_tickets
  ADD COLUMN IF NOT EXISTS assigned_technician_id VARCHAR(128) REFERENCES technician_accounts(id),
  ADD COLUMN IF NOT EXISTS assignment_revision BIGINT NOT NULL DEFAULT 0 CHECK (assignment_revision >= 0),
  ADD COLUMN IF NOT EXISTS main_ticket_number VARCHAR(128),
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cloud_tickets_assigned_active
  ON cloud_tickets (assigned_technician_id, created_at DESC)
  WHERE status IN ('OPEN', 'IN_PROGRESS');
