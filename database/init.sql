-- ============================================================================
-- VENDING MACHINE FLEET MANAGEMENT & MAINTENANCE PLATFORM
-- PRODUCTION POSTGRESQL INITIALIZATION & SCHEMA DDL (PHASE 2)
-- ============================================================================

-- 0. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ENUMS
DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM (
        'SUPER_ADMIN', 'ADMIN', 'MANAGEMENT', 'MAINTENANCE_MANAGER', 
        'TECHNICIAN', 'WAREHOUSE', 'VIEWER'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE machine_status_enum AS ENUM (
        'OPERATIONAL', 'WARNING', 'UNDER_MAINTENANCE', 'OUT_OF_SERVICE', 
        'DECOMMISSIONED', 'WAREHOUSE_BACKUP'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE data_quality_enum AS ENUM (
        'VALID', 'REVIEW_REQUIRED', 'INVALID', 'CORRECTED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE ticket_source_enum AS ENUM (
        'CUSTOMER_QR', 'WHATSAPP', 'PHONE', 'MANUAL', 'SYSTEM_ALERT', 'IMPORT'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE ticket_status_enum AS ENUM (
        'NEW', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_PART', 
        'WAITING_FOR_CUSTOMER', 'RESOLVED', 'VERIFIED', 'CLOSED', 'CANCELLED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE ticket_priority_enum AS ENUM (
        'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE fault_category_enum AS ENUM (
        'PAYMENT', 'POS', 'CARD_READER', 'CASH_ACCEPTOR', 'PRODUCT_DISPENSING', 
        'MOTOR', 'SENSOR', 'DISPLAY', 'TOUCH_SCREEN', 'POWER', 'NETWORK', 
        'TEMPERATURE', 'REFRIGERATION', 'DOOR', 'COIN_SYSTEM', 'SOFTWARE', 
        'MECHANICAL', 'OTHER'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE technician_status_enum AS ENUM (
        'AVAILABLE', 'BUSY', 'OFFLINE', 'ON_LEAVE'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE inventory_transaction_enum AS ENUM (
        'RECEIVE', 'ISSUE', 'RETURN', 'ADJUSTMENT', 'TRANSFER', 'SCRAP'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE part_request_status_enum AS ENUM (
        'REQUESTED', 'APPROVED', 'ORDERED', 'RECEIVED', 'ISSUED', 'REJECTED', 'CANCELLED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE notification_type_enum AS ENUM (
        'TICKET_CREATED', 'TICKET_ASSIGNED', 'TICKET_ESCALATED', 
        'LOW_STOCK_WARNING', 'PART_REQUEST_PENDING', 'SYSTEM_ALERT'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. USERS, ROLES & PERMISSIONS
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    role user_role_enum NOT NULL DEFAULT 'VIEWER',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    module VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role user_role_enum NOT NULL,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role, permission_id)
);

-- 3. BUILDINGS, FLOORS & LOCATIONS
CREATE TABLE IF NOT EXISTS buildings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    code VARCHAR(50) UNIQUE,
    address TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS floors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    floor_number INT,
    floor_name VARCHAR(100) NOT NULL,
    floor_name_ar VARCHAR(100),
    level_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    floor_id UUID REFERENCES floors(id) ON DELETE SET NULL,
    area_zone VARCHAR(255) NOT NULL,
    area_zone_ar VARCHAR(255),
    full_description TEXT NOT NULL,
    original_raw_text TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. MACHINE FLEET
CREATE TABLE IF NOT EXISTS machine_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_name VARCHAR(100) NOT NULL UNIQUE,
    manufacturer VARCHAR(100) NOT NULL,
    category VARCHAR(50) DEFAULT 'SNACK_AND_BEVERAGE',
    specifications JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS machines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    public_id UUID UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
    machine_number VARCHAR(100) UNIQUE NOT NULL,
    serial_number VARCHAR(150),
    model_id UUID REFERENCES machine_models(id) ON DELETE SET NULL,
    machine_type VARCHAR(100) DEFAULT 'STANDARD_VENDING',
    status machine_status_enum NOT NULL DEFAULT 'OPERATIONAL',
    data_quality_status data_quality_enum NOT NULL DEFAULT 'VALID',
    quality_notes TEXT,
    health_score INT NOT NULL DEFAULT 100 CHECK (health_score BETWEEN 0 AND 100),
    installation_date DATE,
    last_maintenance_at TIMESTAMPTZ,
    next_maintenance_due DATE,
    qr_code_url VARCHAR(500),
    notes TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS machine_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    unassigned_at TIMESTAMPTZ,
    is_current BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_machine_current_location ON machine_locations (machine_id) WHERE is_current = TRUE;

CREATE TABLE IF NOT EXISTS qr_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    public_url VARCHAR(500) NOT NULL,
    qr_svg TEXT,
    scan_count INT NOT NULL DEFAULT 0,
    last_scanned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. IMPORT AUDIT LOGS (DATA PRESERVATION)
CREATE TABLE IF NOT EXISTS imports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_name VARCHAR(255) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    file_hash_sha256 VARCHAR(64) NOT NULL,
    imported_by UUID REFERENCES users(id) ON DELETE SET NULL,
    total_columns_detected INT NOT NULL,
    total_records_created INT NOT NULL,
    review_required_count INT NOT NULL DEFAULT 0,
    invalid_records_count INT NOT NULL DEFAULT 0,
    summary_report JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS import_rows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_id UUID NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
    source_sheet VARCHAR(100) NOT NULL,
    source_column VARCHAR(20) NOT NULL,
    source_row INT NOT NULL,
    original_machine_number TEXT,
    original_serial_number TEXT,
    original_building TEXT,
    original_location TEXT,
    normalized_machine_id UUID REFERENCES machines(id) ON DELETE SET NULL,
    normalized_location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    data_quality_status data_quality_enum NOT NULL,
    detected_issues JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. TECHNICIANS & FIELD FORCE
CREATE TABLE IF NOT EXISTS technicians (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    employee_code VARCHAR(50) UNIQUE NOT NULL,
    specialization VARCHAR(100),
    status technician_status_enum NOT NULL DEFAULT 'AVAILABLE',
    skills TEXT[] DEFAULT '{}',
    assigned_region VARCHAR(100),
    max_active_tickets INT NOT NULL DEFAULT 5,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. TICKETING SYSTEM
CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_number VARCHAR(50) UNIQUE NOT NULL,
    machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    source ticket_source_enum NOT NULL DEFAULT 'CUSTOMER_QR',
    category fault_category_enum NOT NULL DEFAULT 'OTHER',
    priority ticket_priority_enum NOT NULL DEFAULT 'MEDIUM',
    status ticket_status_enum NOT NULL DEFAULT 'NEW',
    description TEXT NOT NULL,
    reporter_name VARCHAR(150),
    reporter_phone VARCHAR(50),
    assigned_technician_id UUID REFERENCES technicians(id) ON DELETE SET NULL,
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
    recurring_occurrence_count INT NOT NULL DEFAULT 1,
    sla_due_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    root_cause TEXT,
    resolution_summary TEXT,
    total_parts_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ticket_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    previous_status ticket_status_enum,
    new_status ticket_status_enum NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ticket_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    file_url VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS maintenance_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    technician_id UUID NOT NULL REFERENCES technicians(id) ON DELETE RESTRICT,
    action_type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    parts_replaced JSONB DEFAULT '[]'::jsonb,
    duration_minutes INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. SPARE PARTS, INVENTORY & SUPPLIERS
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(150),
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS spare_part_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    name_ar VARCHAR(100),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS spare_parts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    part_number VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    category_id UUID REFERENCES spare_part_categories(id) ON DELETE SET NULL,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    manufacturer VARCHAR(100),
    compatible_models TEXT[] DEFAULT '{}',
    unit VARCHAR(50) NOT NULL DEFAULT 'PIECE',
    current_quantity INT NOT NULL DEFAULT 0 CHECK (current_quantity >= 0),
    min_stock_level INT NOT NULL DEFAULT 5,
    max_stock_level INT NOT NULL DEFAULT 100,
    unit_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    storage_location VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    part_id UUID NOT NULL REFERENCES spare_parts(id) ON DELETE RESTRICT,
    transaction_type inventory_transaction_enum NOT NULL,
    quantity_delta INT NOT NULL,
    balance_after INT NOT NULL CHECK (balance_after >= 0),
    reference_ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
    performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    unit_price NUMERIC(10, 2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS spare_part_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    technician_id UUID NOT NULL REFERENCES technicians(id) ON DELETE RESTRICT,
    part_id UUID NOT NULL REFERENCES spare_parts(id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    priority ticket_priority_enum NOT NULL DEFAULT 'MEDIUM',
    status part_request_status_enum NOT NULL DEFAULT 'REQUESTED',
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. NOTIFICATIONS & AUDIT LOGS
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type notification_type_enum NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    link_url VARCHAR(500),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_name VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS machine_failure_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
    category fault_category_enum NOT NULL,
    downtime_minutes INT DEFAULT 0,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 10. INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status);
CREATE INDEX IF NOT EXISTS idx_machines_quality ON machines(data_quality_status);
CREATE INDEX IF NOT EXISTS idx_machines_health ON machines(health_score);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_machine ON tickets(machine_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets(assigned_technician_id);
CREATE INDEX IF NOT EXISTS idx_inventory_parts_stock ON spare_parts(current_quantity, min_stock_level);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
