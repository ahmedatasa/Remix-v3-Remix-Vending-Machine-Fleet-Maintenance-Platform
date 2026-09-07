-- ============================================================================
-- KSU Vending Management System — Cloud PostgreSQL Migration 002 (Phase 5.4)
-- Location Management, Machine Proposals & Secure Field Exceptions
-- Non-destructive: ALTER TABLE ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS
-- ============================================================================

-- 1. Add authoritative location metadata columns to cloud_machines
ALTER TABLE cloud_machines
  ADD COLUMN IF NOT EXISTS location_source VARCHAR(50) NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS location_note TEXT,
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS location_updated_by_actor_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS location_updated_by_actor_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_cloud_machines_location_source ON cloud_machines (location_source);

-- 2. Machine Location Proposals Table
-- Captures technician-proposed machine coordinates for unconfigured or relocating machines
CREATE TABLE IF NOT EXISTS machine_location_proposals (
  id VARCHAR(64) PRIMARY KEY,
  integration_machine_id VARCHAR(128) NOT NULL,
  public_qr_token VARCHAR(64) NOT NULL,
  ticket_id VARCHAR(128),
  technician_id VARCHAR(128) NOT NULL,
  technician_name VARCHAR(255) NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy_meters DOUBLE PRECISION NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  submitted_ip VARCHAR(64),
  approved_by_actor_id VARCHAR(128),
  approved_by_actor_name VARCHAR(255),
  approved_at TIMESTAMPTZ,
  rejected_by_actor_id VARCHAR(128),
  rejected_by_actor_name VARCHAR(255),
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_location_proposals_machine_id ON machine_location_proposals (integration_machine_id);
CREATE INDEX IF NOT EXISTS idx_location_proposals_status ON machine_location_proposals (status);
CREATE INDEX IF NOT EXISTS idx_location_proposals_ticket_id ON machine_location_proposals (ticket_id);
CREATE INDEX IF NOT EXISTS idx_location_proposals_technician_id ON machine_location_proposals (technician_id);

-- 3. Field Exception Approvals Table
-- Authoritative server-side approvals for technician checkins when GPS cannot be verified
CREATE TABLE IF NOT EXISTS field_exception_approvals (
  id VARCHAR(64) PRIMARY KEY,
  ticket_id VARCHAR(128) NOT NULL,
  integration_machine_id VARCHAR(128) NOT NULL,
  technician_id VARCHAR(128),
  reason TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'APPROVED',
  approved_by_actor_id VARCHAR(128) NOT NULL,
  approved_by_actor_name VARCHAR(255) NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_field_exception_approvals_ticket ON field_exception_approvals (ticket_id);
CREATE INDEX IF NOT EXISTS idx_field_exception_approvals_machine ON field_exception_approvals (integration_machine_id);
CREATE INDEX IF NOT EXISTS idx_field_exception_approvals_status ON field_exception_approvals (status);
