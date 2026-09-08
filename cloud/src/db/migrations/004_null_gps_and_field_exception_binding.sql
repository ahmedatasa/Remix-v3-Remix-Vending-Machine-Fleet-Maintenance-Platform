-- ============================================================================
-- KSU Vending Management System — Cloud PostgreSQL Migration 004 (Phase 5.4.5A)
-- Enforce NULL GPS Invariants & Field Exception Binding
-- Non-destructive: ALTER TABLE ALTER COLUMN DROP NOT NULL, ALTER TABLE ADD COLUMN IF NOT EXISTS
-- ============================================================================

-- 1. Allow NULL coordinates for technician check-in records (manual exceptions without GPS)
ALTER TABLE technician_checkins
  ALTER COLUMN latitude DROP NOT NULL,
  ALTER COLUMN longitude DROP NOT NULL,
  ALTER COLUMN accuracy_meters DROP NOT NULL,
  ALTER COLUMN distance_meters DROP NOT NULL;

-- 2. Add field_exception_id to technician_checkins for direct reference
ALTER TABLE technician_checkins
  ADD COLUMN IF NOT EXISTS field_exception_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_technician_checkins_field_exception_id ON technician_checkins (field_exception_id);
