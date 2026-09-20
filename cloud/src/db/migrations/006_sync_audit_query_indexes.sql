-- Phase G2: accelerate secure Main -> Cloud machine-location audit queries.
CREATE INDEX IF NOT EXISTS idx_audit_events_machine_sync_created_at
  ON audit_events ((details->>'machineId'), created_at DESC)
  WHERE entity = 'MACHINE' AND action LIKE 'MAIN_MACHINE_LOCATION_SYNC_%';

CREATE INDEX IF NOT EXISTS idx_audit_events_action_created_at
  ON audit_events (action, created_at DESC);
