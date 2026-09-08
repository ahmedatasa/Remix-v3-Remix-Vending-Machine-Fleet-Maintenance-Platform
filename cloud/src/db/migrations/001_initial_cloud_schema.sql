-- ============================================================================
-- KSU Vending Management System — Cloud PostgreSQL Initial Schema (Phase 5)
-- Target: Managed PostgreSQL (Supabase / Cloud SQL)
-- Non-destructive: Uses CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS
-- ============================================================================

-- Migration tracker
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 1. Sanitized Cloud Machine Registry (Mirror of Desktop Authoritative Fleet)
CREATE TABLE IF NOT EXISTS cloud_machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_machine_id VARCHAR(128) NOT NULL UNIQUE,
  public_qr_token VARCHAR(64) NOT NULL UNIQUE,
  machine_number VARCHAR(128),
  model VARCHAR(255),
  machine_type VARCHAR(128) NOT NULL DEFAULT 'VENDING_MACHINE',
  public_display_name VARCHAR(255) NOT NULL,
  building_public_name VARCHAR(255) NOT NULL,
  location_public_name VARCHAR(255) NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  lifecycle_status VARCHAR(64) NOT NULL DEFAULT 'OPERATIONAL',
  version INT NOT NULL DEFAULT 1,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cloud_machines_qr_token ON cloud_machines (UPPER(public_qr_token));
CREATE INDEX IF NOT EXISTS idx_cloud_machines_integration_id ON cloud_machines (integration_machine_id);

-- 2. Cloud Tickets (Customer Reports and Field Issues)
CREATE TABLE IF NOT EXISTS cloud_tickets (
  id VARCHAR(128) PRIMARY KEY,
  cloud_report_id VARCHAR(128) NOT NULL UNIQUE,
  tracking_token VARCHAR(128) NOT NULL UNIQUE,
  integration_machine_id VARCHAR(128) NOT NULL,
  public_qr_token VARCHAR(64) NOT NULL,
  category VARCHAR(128) NOT NULL,
  description TEXT NOT NULL,
  reporter_name VARCHAR(255) DEFAULT '',
  reporter_phone VARCHAR(64) DEFAULT '',
  reporter_email VARCHAR(255) DEFAULT '',
  status VARCHAR(64) NOT NULL DEFAULT 'OPEN',
  sync_status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
  resolution_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cloud_tickets_tracking_token ON cloud_tickets (UPPER(tracking_token));
CREATE INDEX IF NOT EXISTS idx_cloud_tickets_machine_id ON cloud_tickets (integration_machine_id);
CREATE INDEX IF NOT EXISTS idx_cloud_tickets_status ON cloud_tickets (status);

-- 3. Technician Accounts
CREATE TABLE IF NOT EXISTS technician_accounts (
  id VARCHAR(128) PRIMARY KEY,
  employee_code VARCHAR(64) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(64),
  password_hash VARCHAR(255) NOT NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'ACTIVE',
  specialization VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_technician_accounts_employee_code ON technician_accounts (employee_code);

-- 4. Technician Sessions (Persistent, 192-bit cryptographic tokens)
CREATE TABLE IF NOT EXISTS technician_sessions (
  session_id VARCHAR(128) PRIMARY KEY,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  technician_id VARCHAR(128) NOT NULL REFERENCES technician_accounts(id) ON DELETE CASCADE,
  employee_code VARCHAR(64) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_technician_sessions_token_hash ON technician_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_technician_sessions_expires_at ON technician_sessions (expires_at);

-- 5. Technician GPS Check-in Records
CREATE TABLE IF NOT EXISTS technician_checkins (
  id VARCHAR(128) PRIMARY KEY,
  ticket_id VARCHAR(128) NOT NULL,
  technician_id VARCHAR(128) NOT NULL,
  technician_name VARCHAR(255) NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_meters DOUBLE PRECISION,
  distance_meters DOUBLE PRECISION,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(64) NOT NULL,
  field_exception_id VARCHAR(64),
  manual_exception JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_technician_checkins_ticket_id ON technician_checkins (ticket_id);

-- 6. Ticket Maintenance Actions
CREATE TABLE IF NOT EXISTS ticket_actions (
  id VARCHAR(128) PRIMARY KEY,
  ticket_id VARCHAR(128) NOT NULL,
  technician_id VARCHAR(128) NOT NULL,
  technician_name VARCHAR(255) NOT NULL,
  action_type VARCHAR(128) NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ticket_actions_ticket_id ON ticket_actions (ticket_id);

-- 7. Evidence Metadata (Object storage references)
CREATE TABLE IF NOT EXISTS ticket_evidence (
  id VARCHAR(128) PRIMARY KEY,
  ticket_id VARCHAR(128) NOT NULL,
  technician_id VARCHAR(128) NOT NULL,
  technician_name VARCHAR(255) NOT NULL,
  object_key VARCHAR(512) NOT NULL,
  url VARCHAR(1024) NOT NULL,
  mime_type VARCHAR(64) NOT NULL,
  size_bytes BIGINT NOT NULL,
  sha256 VARCHAR(128) NOT NULL,
  caption TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ticket_evidence_ticket_id ON ticket_evidence (ticket_id);

-- 8. Functional Tests
CREATE TABLE IF NOT EXISTS functional_tests (
  id VARCHAR(128) PRIMARY KEY,
  ticket_id VARCHAR(128) NOT NULL,
  technician_id VARCHAR(128) NOT NULL,
  technician_name VARCHAR(255) NOT NULL,
  test_type VARCHAR(128) NOT NULL,
  passed BOOLEAN NOT NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_functional_tests_ticket_id ON functional_tests (ticket_id);

-- 9. Spare Part Requests
CREATE TABLE IF NOT EXISTS part_requests (
  id VARCHAR(128) PRIMARY KEY,
  ticket_id VARCHAR(128) NOT NULL,
  technician_id VARCHAR(128) NOT NULL,
  technician_name VARCHAR(255) NOT NULL,
  part_id VARCHAR(128),
  part_name VARCHAR(255) NOT NULL,
  quantity_requested INT NOT NULL DEFAULT 1,
  reason TEXT NOT NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'REQUESTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_part_requests_ticket_id ON part_requests (ticket_id);

-- 10. Sync Events Queue (Sequential cursor stream for Desktop reconciliation)
CREATE TABLE IF NOT EXISTS sync_events (
  cursor BIGSERIAL PRIMARY KEY,
  event_id VARCHAR(128) NOT NULL UNIQUE,
  event_type VARCHAR(128) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  payload JSONB NOT NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_events_cursor ON sync_events (cursor);
CREATE INDEX IF NOT EXISTS idx_sync_events_event_id ON sync_events (event_id);
CREATE INDEX IF NOT EXISTS idx_sync_events_status ON sync_events (status);

-- 11. Idempotency Keys (Network retry deduplication)
CREATE TABLE IF NOT EXISTS idempotency_keys (
  idempotency_key VARCHAR(255) PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  response_payload JSONB NOT NULL
);

-- 12. Security Audit Events
CREATE TABLE IF NOT EXISTS audit_events (
  id VARCHAR(128) PRIMARY KEY,
  actor_type VARCHAR(64) NOT NULL,
  actor_id VARCHAR(128) NOT NULL,
  actor_name VARCHAR(255) NOT NULL,
  action VARCHAR(128) NOT NULL,
  entity VARCHAR(128) NOT NULL,
  result VARCHAR(64) NOT NULL,
  details JSONB,
  ip VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events (created_at DESC);
