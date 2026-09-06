"""Initial Database Foundation for Vending Machine Fleet & Maintenance

Revision ID: 001_initial_database_foundation
Revises: 
Create Date: 2026-08-26 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001_initial_database_foundation'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 0. PostgreSQL Extensions
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')

    # 1. Users & RBAC
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('email', sa.String(255), unique=True, nullable=False, index=True),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('full_name', sa.String(255), nullable=False),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('role', sa.Enum('SUPER_ADMIN', 'ADMIN', 'MANAGEMENT', 'MAINTENANCE_MANAGER', 'TECHNICIAN', 'WAREHOUSE', 'VIEWER', name='user_role_enum'), nullable=False),
        sa.Column('is_active', sa.Boolean(), default=True, nullable=False),
        sa.Column('is_deleted', sa.Boolean(), default=False, nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    )

    op.create_table(
        'permissions',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('code', sa.String(100), unique=True, nullable=False, index=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('module', sa.String(50), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    )

    op.create_table(
        'role_permissions',
        sa.Column('role', sa.Enum('SUPER_ADMIN', 'ADMIN', 'MANAGEMENT', 'MAINTENANCE_MANAGER', 'TECHNICIAN', 'WAREHOUSE', 'VIEWER', name='user_role_enum'), primary_key=True),
        sa.Column('permission_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('permissions.id', ondelete='CASCADE'), primary_key=True),
    )

    # 2. Buildings, Floors & Locations
    op.create_table(
        'buildings',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False, index=True),
        sa.Column('name_ar', sa.String(255), nullable=True),
        sa.Column('code', sa.String(50), unique=True, nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), default=False, nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    )

    op.create_table(
        'floors',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('building_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('buildings.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('floor_number', sa.Integer(), nullable=True),
        sa.Column('floor_name', sa.String(100), nullable=False),
        sa.Column('floor_name_ar', sa.String(100), nullable=True),
        sa.Column('level_order', sa.Integer(), default=0, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    )

    op.create_table(
        'locations',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('building_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('buildings.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('floor_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('floors.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('area_zone', sa.String(255), nullable=False),
        sa.Column('area_zone_ar', sa.String(255), nullable=True),
        sa.Column('full_description', sa.Text(), nullable=False),
        sa.Column('original_raw_text', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True, nullable=False),
        sa.Column('is_deleted', sa.Boolean(), default=False, nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    )

    # 3. Machine Models, Machines & Locations
    op.create_table(
        'machine_models',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('model_name', sa.String(100), unique=True, nullable=False),
        sa.Column('manufacturer', sa.String(100), nullable=False),
        sa.Column('category', sa.String(50), default='SNACK_AND_BEVERAGE'),
        sa.Column('specifications', postgresql.JSONB(), server_default='{}', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    )

    op.create_table(
        'machines',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('public_id', postgresql.UUID(as_uuid=True), unique=True, nullable=False, server_default=sa.text('uuid_generate_v4()'), index=True),
        sa.Column('machine_number', sa.String(100), unique=True, nullable=False, index=True),
        sa.Column('serial_number', sa.String(150), nullable=True, index=True),
        sa.Column('model_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('machine_models.id', ondelete='SET NULL'), nullable=True),
        sa.Column('machine_type', sa.String(100), default='STANDARD_VENDING'),
        sa.Column('status', sa.Enum('OPERATIONAL', 'WARNING', 'UNDER_MAINTENANCE', 'OUT_OF_SERVICE', 'DECOMMISSIONED', 'WAREHOUSE_BACKUP', name='machine_status_enum'), default='OPERATIONAL', nullable=False, index=True),
        sa.Column('data_quality_status', sa.Enum('VALID', 'REVIEW_REQUIRED', 'INVALID', 'CORRECTED', name='data_quality_enum'), default='VALID', nullable=False, index=True),
        sa.Column('quality_notes', sa.Text(), nullable=True),
        sa.Column('health_score', sa.Integer(), default=100, nullable=False),
        sa.Column('installation_date', sa.Date(), nullable=True),
        sa.Column('last_maintenance_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('next_maintenance_due', sa.Date(), nullable=True),
        sa.Column('qr_code_url', sa.String(500), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), default=False, nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    )

    op.create_table(
        'machine_locations',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('machine_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('machines.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('location_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('locations.id', ondelete='RESTRICT'), nullable=False, index=True),
        sa.Column('assigned_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('unassigned_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_current', sa.Boolean(), default=True, nullable=False),
    )
    op.create_index('idx_machine_current_loc_uniq', 'machine_locations', ['machine_id'], unique=True, postgresql_where=sa.text('is_current = TRUE'))

    op.create_table(
        'qr_codes',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('machine_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('machines.id', ondelete='CASCADE'), unique=True, nullable=False),
        sa.Column('public_url', sa.String(500), nullable=False),
        sa.Column('qr_svg', sa.Text(), nullable=True),
        sa.Column('scan_count', sa.Integer(), default=0, nullable=False),
        sa.Column('last_scanned_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    )

    # 4. Imports & Audit Preservation
    op.create_table(
        'imports',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('file_name', sa.String(255), nullable=False),
        sa.Column('file_size_bytes', sa.BigInteger(), nullable=False),
        sa.Column('file_hash_sha256', sa.String(64), nullable=False, index=True),
        sa.Column('imported_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('total_columns_detected', sa.Integer(), nullable=False),
        sa.Column('total_records_created', sa.Integer(), nullable=False),
        sa.Column('review_required_count', sa.Integer(), default=0, nullable=False),
        sa.Column('invalid_records_count', sa.Integer(), default=0, nullable=False),
        sa.Column('summary_report', postgresql.JSONB(), server_default='{}', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    )

    op.create_table(
        'import_rows',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('import_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('imports.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('source_sheet', sa.String(100), nullable=False),
        sa.Column('source_column', sa.String(20), nullable=False),
        sa.Column('source_row', sa.Integer(), nullable=False),
        sa.Column('original_machine_number', sa.Text(), nullable=True),
        sa.Column('original_serial_number', sa.Text(), nullable=True),
        sa.Column('original_building', sa.Text(), nullable=True),
        sa.Column('original_location', sa.Text(), nullable=True),
        sa.Column('normalized_machine_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('machines.id', ondelete='SET NULL'), nullable=True),
        sa.Column('normalized_location_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('locations.id', ondelete='SET NULL'), nullable=True),
        sa.Column('data_quality_status', sa.Enum('VALID', 'REVIEW_REQUIRED', 'INVALID', 'CORRECTED', name='data_quality_enum'), nullable=False),
        sa.Column('detected_issues', postgresql.JSONB(), server_default='[]', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    )

    # 5. Technicians
    op.create_table(
        'technicians',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), unique=True, nullable=False),
        sa.Column('employee_code', sa.String(50), unique=True, nullable=False, index=True),
        sa.Column('specialization', sa.String(100), nullable=True),
        sa.Column('status', sa.Enum('AVAILABLE', 'BUSY', 'OFFLINE', 'ON_LEAVE', name='technician_status_enum'), default='AVAILABLE', nullable=False, index=True),
        sa.Column('skills', postgresql.ARRAY(sa.String()), server_default='{}', nullable=False),
        sa.Column('assigned_region', sa.String(100), nullable=True),
        sa.Column('max_active_tickets', sa.Integer(), default=5, nullable=False),
        sa.Column('is_deleted', sa.Boolean(), default=False, nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    )

    # 6. Tickets & Maintenance Actions
    op.create_table(
        'tickets',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('ticket_number', sa.String(50), unique=True, nullable=False, index=True),
        sa.Column('machine_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('machines.id', ondelete='RESTRICT'), nullable=False, index=True),
        sa.Column('location_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('locations.id', ondelete='RESTRICT'), nullable=False, index=True),
        sa.Column('source', sa.Enum('CUSTOMER_QR', 'WHATSAPP', 'PHONE', 'MANUAL', 'SYSTEM_ALERT', 'IMPORT', name='ticket_source_enum'), default='CUSTOMER_QR', nullable=False),
        sa.Column('category', sa.Enum('PAYMENT', 'POS', 'CARD_READER', 'CASH_ACCEPTOR', 'PRODUCT_DISPENSING', 'MOTOR', 'SENSOR', 'DISPLAY', 'TOUCH_SCREEN', 'POWER', 'NETWORK', 'TEMPERATURE', 'REFRIGERATION', 'DOOR', 'COIN_SYSTEM', 'SOFTWARE', 'MECHANICAL', 'OTHER', name='fault_category_enum'), default='OTHER', nullable=False, index=True),
        sa.Column('priority', sa.Enum('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', name='ticket_priority_enum'), default='MEDIUM', nullable=False, index=True),
        sa.Column('status', sa.Enum('NEW', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_PART', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'VERIFIED', 'CLOSED', 'CANCELLED', name='ticket_status_enum'), default='NEW', nullable=False, index=True),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('reporter_name', sa.String(150), nullable=True),
        sa.Column('reporter_phone', sa.String(50), nullable=True),
        sa.Column('assigned_technician_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('technicians.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('is_recurring', sa.Boolean(), default=False, nullable=False),
        sa.Column('recurring_occurrence_count', sa.Integer(), default=1, nullable=False),
        sa.Column('sla_due_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('acknowledged_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('root_cause', sa.Text(), nullable=True),
        sa.Column('resolution_summary', sa.Text(), nullable=True),
        sa.Column('total_parts_cost', sa.Numeric(12, 2), default=0.00, nullable=False),
        sa.Column('is_deleted', sa.Boolean(), default=False, nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    )

    op.create_table(
        'ticket_status_history',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('ticket_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tickets.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('previous_status', sa.Enum('NEW', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_PART', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'VERIFIED', 'CLOSED', 'CANCELLED', name='ticket_status_enum'), nullable=True),
        sa.Column('new_status', sa.Enum('NEW', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_PART', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'VERIFIED', 'CLOSED', 'CANCELLED', name='ticket_status_enum'), nullable=False),
        sa.Column('changed_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    )

    op.create_table(
        'ticket_attachments',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('ticket_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tickets.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('file_url', sa.String(500), nullable=False),
        sa.Column('file_name', sa.String(255), nullable=False),
        sa.Column('file_type', sa.String(50), nullable=False),
        sa.Column('file_size_bytes', sa.Integer(), nullable=False),
        sa.Column('uploaded_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    )

    op.create_table(
        'maintenance_actions',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('ticket_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tickets.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('technician_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('technicians.id', ondelete='RESTRICT'), nullable=False, index=True),
        sa.Column('action_type', sa.String(100), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('parts_replaced', postgresql.JSONB(), server_default='[]', nullable=False),
        sa.Column('duration_minutes', sa.Integer(), default=0),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    )

    # 7. Suppliers, Spare Parts & Inventory
    op.create_table(
        'suppliers',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False, index=True),
        sa.Column('contact_person', sa.String(150), nullable=True),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True, nullable=False),
        sa.Column('is_deleted', sa.Boolean(), default=False, nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    )

    op.create_table(
        'spare_part_categories',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('name', sa.String(100), unique=True, nullable=False),
        sa.Column('name_ar', sa.String(100), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    )

    op.create_table(
        'spare_parts',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('part_number', sa.String(100), unique=True, nullable=False, index=True),
        sa.Column('name', sa.String(255), nullable=False, index=True),
        sa.Column('name_ar', sa.String(255), nullable=True),
        sa.Column('category_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('spare_part_categories.id', ondelete='SET NULL'), nullable=True),
        sa.Column('supplier_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('suppliers.id', ondelete='SET NULL'), nullable=True),
        sa.Column('manufacturer', sa.String(100), nullable=True),
        sa.Column('compatible_models', postgresql.ARRAY(sa.String()), server_default='{}', nullable=False),
        sa.Column('unit', sa.String(50), default='PIECE', nullable=False),
        sa.Column('current_quantity', sa.Integer(), default=0, nullable=False),
        sa.Column('min_stock_level', sa.Integer(), default=5, nullable=False),
        sa.Column('max_stock_level', sa.Integer(), default=100, nullable=False),
        sa.Column('unit_cost', sa.Numeric(10, 2), default=0.00, nullable=False),
        sa.Column('storage_location', sa.String(100), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True, nullable=False),
        sa.Column('is_deleted', sa.Boolean(), default=False, nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    )

    op.create_table(
        'inventory_transactions',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('part_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('spare_parts.id', ondelete='RESTRICT'), nullable=False, index=True),
        sa.Column('transaction_type', sa.Enum('RECEIVE', 'ISSUE', 'RETURN', 'ADJUSTMENT', 'TRANSFER', 'SCRAP', name='inventory_transaction_enum'), nullable=False),
        sa.Column('quantity_delta', sa.Integer(), nullable=False),
        sa.Column('balance_after', sa.Integer(), nullable=False),
        sa.Column('reference_ticket_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tickets.id', ondelete='SET NULL'), nullable=True),
        sa.Column('performed_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('unit_price', sa.Numeric(10, 2), default=0.00),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    )

    op.create_table(
        'spare_part_requests',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('ticket_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tickets.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('technician_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('technicians.id', ondelete='RESTRICT'), nullable=False, index=True),
        sa.Column('part_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('spare_parts.id', ondelete='RESTRICT'), nullable=False, index=True),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('priority', sa.Enum('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', name='ticket_priority_enum'), default='MEDIUM'),
        sa.Column('status', sa.Enum('REQUESTED', 'APPROVED', 'ORDERED', 'RECEIVED', 'ISSUED', 'REJECTED', 'CANCELLED', name='part_request_status_enum'), default='REQUESTED', nullable=False),
        sa.Column('approved_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    )

    # 8. Notifications, Audit Logs & Machine Failures
    op.create_table(
        'notifications',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('type', sa.Enum('TICKET_CREATED', 'TICKET_ASSIGNED', 'TICKET_ESCALATED', 'LOW_STOCK_WARNING', 'PART_REQUEST_PENDING', 'SYSTEM_ALERT', name='notification_type_enum'), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('link_url', sa.String(500), nullable=True),
        sa.Column('is_read', sa.Boolean(), default=False, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    )

    op.create_table(
        'audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('action', sa.String(100), nullable=False, index=True),
        sa.Column('entity_name', sa.String(100), nullable=False, index=True),
        sa.Column('entity_id', sa.String(100), nullable=False),
        sa.Column('old_values', postgresql.JSONB(), nullable=True),
        sa.Column('new_values', postgresql.JSONB(), nullable=True),
        sa.Column('ip_address', sa.String(50), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False, index=True),
    )

    op.create_table(
        'machine_failure_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), primary_key=True),
        sa.Column('machine_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('machines.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('ticket_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tickets.id', ondelete='SET NULL'), nullable=True),
        sa.Column('category', sa.Enum('PAYMENT', 'POS', 'CARD_READER', 'CASH_ACCEPTOR', 'PRODUCT_DISPENSING', 'MOTOR', 'SENSOR', 'DISPLAY', 'TOUCH_SCREEN', 'POWER', 'NETWORK', 'TEMPERATURE', 'REFRIGERATION', 'DOOR', 'COIN_SYSTEM', 'SOFTWARE', 'MECHANICAL', 'OTHER', name='fault_category_enum'), nullable=False),
        sa.Column('downtime_minutes', sa.Integer(), default=0),
        sa.Column('occurred_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    )


def downgrade() -> None:
    # Drops in reverse dependency order
    op.drop_table('machine_failure_events')
    op.drop_table('audit_logs')
    op.drop_table('notifications')
    op.drop_table('spare_part_requests')
    op.drop_table('inventory_transactions')
    op.drop_table('spare_parts')
    op.drop_table('spare_part_categories')
    op.drop_table('suppliers')
    op.drop_table('maintenance_actions')
    op.drop_table('ticket_attachments')
    op.drop_table('ticket_status_history')
    op.drop_table('tickets')
    op.drop_table('technicians')
    op.drop_table('import_rows')
    op.drop_table('imports')
    op.drop_table('qr_codes')
    op.drop_table('machine_locations')
    op.drop_table('machines')
    op.drop_table('machine_models')
    op.drop_table('locations')
    op.drop_table('floors')
    op.drop_table('buildings')
    op.drop_table('role_permissions')
    op.drop_table('permissions')
    op.drop_table('users')
