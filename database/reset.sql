-- ============================================================================
-- VENDING MACHINE FLEET MANAGEMENT & MAINTENANCE PLATFORM
-- DEVELOPMENT DATABASE RESET & REINITIALIZATION SCRIPT
-- ============================================================================

DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO PUBLIC;

\i /database/init.sql
\i /database/seed.sql
