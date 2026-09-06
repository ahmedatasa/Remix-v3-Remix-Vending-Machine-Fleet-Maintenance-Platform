-- ============================================================================
-- VENDING MACHINE FLEET MANAGEMENT & MAINTENANCE PLATFORM
-- PRODUCTION SEED & DEMO DATASET (PHASE 2)
-- ============================================================================

-- 1. SEED USERS & PERMISSIONS
-- Default passwords hashed with bcrypt for demo (Password: Admin@123)
INSERT INTO users (id, email, password_hash, full_name, phone, role, is_active) VALUES
('a0000000-0000-0000-0000-000000000001', 'admin@vendingfleet.com', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'System Administrator', '+966501234567', 'SUPER_ADMIN', TRUE),
('a0000000-0000-0000-0000-000000000002', 'manager@vendingfleet.com', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'Tariq Al-Mansoor (Maintenance Manager)', '+966509876543', 'MAINTENANCE_MANAGER', TRUE),
('a0000000-0000-0000-0000-000000000003', 'tech.khalid@vendingfleet.com', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'Khalid Al-Ghamdi (Senior Tech)', '+966551122334', 'TECHNICIAN', TRUE),
('a0000000-0000-0000-0000-000000000004', 'tech.youssef@vendingfleet.com', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'Youssef Al-Harbi (Field Tech)', '+966552233445', 'TECHNICIAN', TRUE),
('a0000000-0000-0000-0000-000000000005', 'warehouse@vendingfleet.com', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'Sami Al-Otaibi (Warehouse Manager)', '+966553344556', 'WAREHOUSE', TRUE)
ON CONFLICT (email) DO NOTHING;

-- 2. SEED TECHNICIANS
INSERT INTO technicians (id, user_id, employee_code, specialization, status, skills, assigned_region, max_active_tickets) VALUES
('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'TECH-001', 'POS & Electronics', 'AVAILABLE', ARRAY['POS Diagnostics', 'Card Readers', 'Coin Mechanisms', 'Motherboard Repair'], 'Central Campus', 6),
('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'TECH-002', 'Refrigeration & Mechanics', 'BUSY', ARRAY['Compressor Repair', 'Dispensing Motors', 'Temperature Calibration', 'Door Mechanics'], 'North Campus', 5)
ON CONFLICT (employee_code) DO NOTHING;

-- 3. SEED BUILDINGS & FLOORS
INSERT INTO buildings (id, name, name_ar, code, address) VALUES
('c0000000-0000-0000-0000-000000000001', 'Administrative Headquarters', 'مبنى الإدارة الرئيسي', 'HQ-ADM', 'Main Campus Gate 1, Administrative Ave'),
('c0000000-0000-0000-0000-000000000002', 'College of Engineering', 'كلية الهندسة', 'ENG-FAC', 'Engineering Complex, Building 42'),
('c0000000-0000-0000-0000-000000000003', 'Medical Sciences Complex', 'مجمع العلوم الطبية', 'MED-CMP', 'Healthcare District, South Ring'),
('c0000000-0000-0000-0000-000000000004', 'Central Logistics Depot', 'المستودع المركزي للخدمات اللوجستية', 'DEPOT-01', 'Warehouse District, Sector 9')
ON CONFLICT (code) DO NOTHING;

INSERT INTO floors (id, building_id, floor_number, floor_name, floor_name_ar, level_order) VALUES
('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 0, 'Ground Floor', 'الدور الأرضي', 0),
('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 1, 'First Floor', 'الدور الأول', 1),
('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 0, 'Ground Floor', 'الدور الأرضي', 0),
('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 2, 'Second Floor - Computer Labs', 'الدور الثاني - معامل الحاسب', 2),
('d0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', -1, 'Basement Spare Depot', 'مستودع قطع الغيار والوحدات الاحتياطية', -1)
ON CONFLICT (id) DO NOTHING;

-- 4. SEED LOCATIONS
INSERT INTO locations (id, building_id, floor_id, area_zone, area_zone_ar, full_description, original_raw_text) VALUES
('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Main Reception Lobby', 'بهو الاستقبال الرئيسي', 'Administrative Headquarters - Ground Floor - Main Reception Lobby', 'مبنى الإدارة الرئيسي - الدور الأرضي - بهو الاستقبال بجوار المصاعد'),
('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'Staff Cafeteria', 'كافتيريا الموظفين', 'Administrative Headquarters - First Floor - Staff Cafeteria', 'مبنى الإدارة الرئيسي - الدور الأول - كافتيريا الموظفين'),
('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', 'Engineering North Wing Entrance', 'مدخل الجناح الشمالي', 'College of Engineering - Ground Floor - North Entrance next to Lab 102', 'كلية الهندسة - الدور الأرضي - الجناح الشمالي بجوار معمل 102'),
('e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000005', 'Warehouse Reserve Bay 4', 'المستودع الرئيسي - رصيف الاحتياط 4', 'Central Logistics Depot - Basement - Reserve Rack B4', 'المستودع المركزي - قبو التخزين - رصيف الاحتياط')
ON CONFLICT (id) DO NOTHING;

-- 5. SEED MACHINE MODELS
INSERT INTO machine_models (id, model_name, manufacturer, category, specifications) VALUES
('f0000000-0000-0000-0000-000000000001', 'VendMax Pro 400', 'FAS International', 'SNACK_AND_BEVERAGE', '{"trays": 6, "capacity": 450, "refrigerated": true, "pos_type": "MDB_NAYAX"}'::jsonb),
('f0000000-0000-0000-0000-000000000002', 'CoffeeArt Grande', 'Schaerer AG', 'HOT_BEVERAGE', '{"canisters": 4, "cup_capacity": 300, "dual_boiler": true}'::jsonb)
ON CONFLICT (model_name) DO NOTHING;

-- 6. SEED MACHINES (Covering all operational & quality cases)
INSERT INTO machines (id, public_id, machine_number, serial_number, model_id, machine_type, status, data_quality_status, health_score, qr_code_url, notes) VALUES
('10000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'VM-001', 'SN-FAS-9988201', 'f0000000-0000-0000-0000-000000000001', 'SNACK_AND_BEVERAGE', 'OPERATIONAL', 'VALID', 98, '/report/90000000-0000-0000-0000-000000000001', 'Fully operational, high traffic lobby unit.'),
('10000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000002', 'VM-002', 'SN-SCH-4481092', 'f0000000-0000-0000-0000-000000000002', 'HOT_BEVERAGE', 'WARNING', 'VALID', 74, '/report/90000000-0000-0000-0000-000000000002', 'Frequent coin acceptor rejection reports.'),
('10000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000003', 'VM-003', NULL, 'f0000000-0000-0000-0000-000000000001', 'SNACK_AND_BEVERAGE', 'UNDER_MAINTENANCE', 'REVIEW_REQUIRED', 45, '/report/90000000-0000-0000-0000-000000000003', 'Original serial missing in legacy sheet (recorded as ؟؟؟؟). POS reader intermittent.'),
('10000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000004', 'VM-SPARE-01', 'SN-FAS-BACKUP-01', 'f0000000-0000-0000-0000-000000000001', 'SNACK_AND_BEVERAGE', 'WAREHOUSE_BACKUP', 'VALID', 100, '/report/90000000-0000-0000-0000-000000000004', 'Backup unit in central warehouse.')
ON CONFLICT (machine_number) DO NOTHING;

-- LINK MACHINES TO CURRENT LOCATIONS
INSERT INTO machine_locations (machine_id, location_id, is_current) VALUES
('10000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', TRUE),
('10000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', TRUE),
('10000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000003', TRUE),
('10000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000004', TRUE)
ON CONFLICT DO NOTHING;

-- 7. SEED SPARE PARTS & CATEGORIES
INSERT INTO spare_part_categories (id, name, name_ar, description) VALUES
('20000000-0000-0000-0000-000000000001', 'Payment & Telemetry', 'أنظمة الدفع والاتصال', 'POS Readers, MDB Harnesses, Bill Validators'),
('20000000-0000-0000-0000-000000000002', 'Motors & Dispensing', 'المحركات والتروس', 'Spiral Motors, Drop Sensors, Tray Harnesses'),
('20000000-0000-0000-0000-000000000003', 'Refrigeration & Power', 'التبريد ووحدات الطاقة', 'Compressors, Evaporator Fans, Power Supplies')
ON CONFLICT (name) DO NOTHING;

INSERT INTO spare_parts (id, part_number, name, name_ar, category_id, unit, current_quantity, min_stock_level, unit_cost, storage_location) VALUES
('30000000-0000-0000-0000-000000000001', 'PRT-POS-NAYAX-01', 'Nayax VPOS Touch Terminal', 'جهاز قارئ البطاقات والمدفوعات الإلكترونية', '20000000-0000-0000-0000-000000000001', 'PIECE', 12, 5, 380.00, 'Shelf A-12'),
('30000000-0000-0000-0000-000000000002', 'PRT-MOT-SPIRAL-24V', '24V DC Spiral Dispenser Motor', 'محرك اللولب الداخلي 24 فولت', '20000000-0000-0000-0000-000000000002', 'PIECE', 3, 8, 45.00, 'Shelf B-04'), -- LOW STOCK ALERT
('30000000-0000-0000-0000-000000000003', 'PRT-PWR-MEANWELL-24V', 'MeanWell 24V 150W Power Supply', 'وحدة تزويد الطاقة 24 فولت', '20000000-0000-0000-0000-000000000003', 'PIECE', 18, 4, 65.00, 'Shelf C-01'),
('30000000-0000-0000-0000-000000000004', 'PRT-SNS-OPTICAL-DROP', 'Optical Infrared Drop Sensor Pair', 'حساس استشعار سقوط المنتج بالأشعة تحت الحمراء', '20000000-0000-0000-0000-000000000002', 'SET', 2, 6, 28.00, 'Shelf B-08') -- LOW STOCK ALERT
ON CONFLICT (part_number) DO NOTHING;

-- 8. SEED TICKETS & LIFECYCLE
INSERT INTO tickets (id, ticket_number, machine_id, location_id, source, category, priority, status, description, reporter_name, reporter_phone, assigned_technician_id, is_recurring, recurring_occurrence_count) VALUES
('40000000-0000-0000-0000-000000000001', 'TKT-2026-0001', '10000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000003', 'CUSTOMER_QR', 'POS', 'HIGH', 'IN_PROGRESS', 'Card reader takes contactless payment but does not dispense the selected item.', 'Student Reporter', '+966500112233', 'b0000000-0000-0000-0000-000000000001', TRUE, 2),
('40000000-0000-0000-0000-000000000002', 'TKT-2026-0002', '10000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 'CUSTOMER_QR', 'COIN_SYSTEM', 'MEDIUM', 'ASSIGNED', 'Coin slot jams when inserting 1 riyal coins.', 'Ahmed Staff', '+966500998877', 'b0000000-0000-0000-0000-000000000002', FALSE, 1)
ON CONFLICT (ticket_number) DO NOTHING;

-- STATUS TRANSITION AUDIT TRAIL
INSERT INTO ticket_status_history (ticket_id, previous_status, new_status, changed_by, comment) VALUES
('40000000-0000-0000-0000-000000000001', NULL, 'NEW', NULL, 'Customer submitted ticket via QR code.'),
('40000000-0000-0000-0000-000000000001', 'NEW', 'TRIAGED', 'a0000000-0000-0000-0000-000000000002', 'Triage confirmed repeated POS issue.'),
('40000000-0000-0000-0000-000000000001', 'TRIAGED', 'ASSIGNED', 'a0000000-0000-0000-0000-000000000002', 'Assigned to Senior Electronics Tech Khalid.'),
('40000000-0000-0000-0000-000000000001', 'ASSIGNED', 'IN_PROGRESS', 'a0000000-0000-0000-0000-000000000003', 'Technician arrived on site at Engineering North Wing.')
ON CONFLICT DO NOTHING;

-- 9. SEED SPARE PART REQUESTS
INSERT INTO spare_part_requests (id, ticket_id, technician_id, part_id, quantity, priority, status, reason) VALUES
('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 2, 'HIGH', 'REQUESTED', 'Two spiral motors burned out on Tray 3.')
ON CONFLICT DO NOTHING;
