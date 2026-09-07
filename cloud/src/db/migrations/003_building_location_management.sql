-- ============================================================================
-- KSU Vending Management System — Cloud PostgreSQL Migration 003 (Phase 5.4.2)
-- Building Geographic Location Management & Spatial References
-- Non-destructive: CREATE TABLE IF NOT EXISTS, ALTER TABLE ADD COLUMN IF NOT EXISTS
-- ============================================================================

-- 1. Create or extend cloud_buildings table with authoritative location metadata
CREATE TABLE IF NOT EXISTS cloud_buildings (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255),
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location_source VARCHAR(50) NOT NULL DEFAULT 'NONE',
  location_status VARCHAR(50) NOT NULL DEFAULT 'LOCATION_NOT_CONFIGURED',
  location_note TEXT,
  location_updated_at TIMESTAMPTZ,
  location_updated_by_actor_id VARCHAR(128),
  location_updated_by_actor_name VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Ensure columns exist in case cloud_buildings was already present
ALTER TABLE cloud_buildings
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_source VARCHAR(50) NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS location_status VARCHAR(50) NOT NULL DEFAULT 'LOCATION_NOT_CONFIGURED',
  ADD COLUMN IF NOT EXISTS location_note TEXT,
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS location_updated_by_actor_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS location_updated_by_actor_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_cloud_buildings_code ON cloud_buildings (code);
CREATE INDEX IF NOT EXISTS idx_cloud_buildings_location_status ON cloud_buildings (location_status);
CREATE INDEX IF NOT EXISTS idx_cloud_buildings_location_source ON cloud_buildings (location_source);
