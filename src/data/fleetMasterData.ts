import {
  Machine, Ticket, Location, Building, Floor, Technician, SparePart,
  SparePartCategory, InventoryTransaction, SparePartRequest, Supplier,
  AuditLog, User, MachineModel, MachineStatus, TicketPriority,
  FaultCategory, DataQualityStatus,
  ImportBatch, ImportRowEntity
} from '../types';

export const SEED_BUILDINGS: Building[] = [
  {
    id: 'bld-001',
    name: 'Main Administration Complex',
    nameAr: 'مجمع الإدارة الرئيسي',
    code: 'BLD-HQ',
    address: 'King Fahd Road, Business District',
    createdAt: '2026-01-10T08:00:00Z',
    updatedAt: '2026-01-10T08:00:00Z'
  },
  {
    id: 'bld-002',
    name: 'College of Engineering & Computing',
    nameAr: 'كلية الهندسة والحاسب الآلي',
    code: 'BLD-ENG',
    address: 'North University Campus, Gate 4',
    createdAt: '2026-01-12T09:00:00Z',
    updatedAt: '2026-01-12T09:00:00Z'
  },
  {
    id: 'bld-003',
    name: 'Medical City & Teaching Hospital',
    nameAr: 'المدينة الطبية والمستشفى الجامعي',
    code: 'BLD-MED',
    address: 'Health Sciences Boulevard',
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z'
  },
  {
    id: 'bld-004',
    name: 'Central Library & Student Hub',
    nameAr: 'المكتبة المركزية ومركز الأنشطة الطلابية',
    code: 'BLD-LIB',
    address: 'University Square',
    createdAt: '2026-01-18T11:00:00Z',
    updatedAt: '2026-01-18T11:00:00Z'
  }
];

export const SEED_FLOORS: Floor[] = [
  { id: 'flr-001', buildingId: 'bld-001', floorName: 'Ground Floor Lobby', floorNameAr: 'الدور الأرضي - البهو الرئيسي', levelOrder: 0, createdAt: '2026-01-10T08:30:00Z' },
  { id: 'flr-002', buildingId: 'bld-001', floorName: 'First Floor - Executive Suites', floorNameAr: 'الدور الأول - الإدارة التنفيذية', levelOrder: 1, createdAt: '2026-01-10T08:35:00Z' },
  { id: 'flr-003', buildingId: 'bld-002', floorName: 'Ground Floor - Atrium', floorNameAr: 'الدور الأرضي - الردهة', levelOrder: 0, createdAt: '2026-01-12T09:30:00Z' },
  { id: 'flr-004', buildingId: 'bld-002', floorName: 'Second Floor - Computer Labs', floorNameAr: 'الدور الثاني - معامل الحاسب', levelOrder: 2, createdAt: '2026-01-12T09:35:00Z' },
  { id: 'flr-005', buildingId: 'bld-003', floorName: 'Ground Floor - Emergency Hall', floorNameAr: 'الدور الأرضي - بهو الطوارئ', levelOrder: 0, createdAt: '2026-01-15T10:30:00Z' },
  { id: 'flr-006', buildingId: 'bld-003', floorName: 'Third Floor - ICU Waiting Area', floorNameAr: 'الدور الثالث - استراحة العناية', levelOrder: 3, createdAt: '2026-01-15T10:35:00Z' },
  { id: 'flr-007', buildingId: 'bld-004', floorName: 'Ground Floor - Study Lounge', floorNameAr: 'الدور الأرضي - صالة الاستذكار', levelOrder: 0, createdAt: '2026-01-18T11:30:00Z' }
];

export const SEED_LOCATIONS: Location[] = [
  {
    id: 'loc-001',
    buildingId: 'bld-001',
    floorId: 'flr-001',
    areaZone: 'West Gate Entrance Near Elevators',
    areaZoneAr: 'بوابة المدخل الغربي بجوار المصاعد',
    fullDescription: 'Main Administration Complex > Ground Floor Lobby > West Gate Entrance Near Elevators',
    isActive: true,
    createdAt: '2026-01-10T09:00:00Z'
  },
  {
    id: 'loc-002',
    buildingId: 'bld-001',
    floorId: 'flr-002',
    areaZone: 'Executive Lounge Hallway',
    areaZoneAr: 'ممر استراحة كبار المسؤولين',
    fullDescription: 'Main Administration Complex > First Floor > Executive Lounge Hallway',
    isActive: true,
    createdAt: '2026-01-10T09:15:00Z'
  },
  {
    id: 'loc-003',
    buildingId: 'bld-002',
    floorId: 'flr-003',
    areaZone: 'Cafeteria Corridor & Courtyard',
    areaZoneAr: 'ممر الكافتيريا والساحة الداخلية',
    fullDescription: 'College of Engineering > Ground Floor Atrium > Cafeteria Corridor',
    isActive: true,
    createdAt: '2026-01-12T10:00:00Z'
  },
  {
    id: 'loc-004',
    buildingId: 'bld-002',
    floorId: 'flr-004',
    areaZone: 'Lab Wing 204 Waiting Area',
    areaZoneAr: 'صالة انتظار معامل الجناح 204',
    fullDescription: 'College of Engineering > Second Floor > Lab Wing 204 Waiting Area',
    isActive: true,
    createdAt: '2026-01-12T10:15:00Z'
  },
  {
    id: 'loc-005',
    buildingId: 'bld-003',
    floorId: 'flr-005',
    areaZone: 'ER Main Visitors Waiting Room',
    areaZoneAr: 'استراحة زوار الطوارئ الرئيسية',
    fullDescription: 'Medical City > Ground Floor Emergency > ER Main Visitors Waiting Room',
    isActive: true,
    createdAt: '2026-01-15T11:00:00Z'
  },
  {
    id: 'loc-006',
    buildingId: 'bld-003',
    floorId: 'flr-006',
    areaZone: 'ICU Family Lounge North Corner',
    areaZoneAr: 'استراحة أهالي العناية المركزة - الركن الشمالي',
    fullDescription: 'Medical City > Third Floor > ICU Family Lounge North Corner',
    isActive: true,
    createdAt: '2026-01-15T11:15:00Z'
  },
  {
    id: 'loc-007',
    buildingId: 'bld-004',
    floorId: 'flr-007',
    areaZone: '24/7 Digital Learning Commons',
    areaZoneAr: 'قاعة التعلم الرقمي المفتوحة',
    fullDescription: 'Central Library > Ground Floor > 24/7 Digital Learning Commons',
    isActive: true,
    createdAt: '2026-01-18T12:00:00Z'
  }
];

export const SEED_MACHINE_MODELS: MachineModel[] = [
  {
    id: 'mdl-001',
    modelName: 'RoboVendor Pro Cold & Snack 500',
    manufacturer: 'Fas International / Crane',
    category: 'COMBINED_SNACK_BEVERAGE',
    specifications: { trays: 6, maxCapacity: 360, coolingTempC: 4, posInterface: 'MDB / DEX 3.0', screen: '10.1 inch Touch' }
  },
  {
    id: 'mdl-002',
    modelName: 'BaristaTouch Espresso Bean-to-Cup',
    manufacturer: 'Necta / Evoca Group',
    category: 'HOT_BEVERAGE_COFFEE',
    specifications: { boilerCapacityL: 0.6, beanHopperKg: 2.5, canisters: 5, posInterface: 'MDB / Nayax VPOS' }
  },
  {
    id: 'mdl-003',
    modelName: 'HydroPure Smart Bottled Drinks Dispenser',
    manufacturer: 'Sanden Vendo',
    category: 'COLD_BEVERAGE',
    specifications: { columns: 8, canCapacity: 480, refrigerant: 'R290 Eco', energyRating: 'A+' }
  }
];

export const SEED_MACHINES: Machine[] = [
  {
    id: 'mch-001',
    publicId: 'VM-A8B9C0',
    publicQrId: 'QR-A8B9C0-KSU-01',
    machineNumber: 'VM-B01-F01-01',
    serialNumber: 'SN-2024-88491',
    modelId: 'mdl-001',
    machineType: 'Combination Snack & Soda',
    status: 'OPERATIONAL',
    dataQualityStatus: 'VALID',
    healthScore: 96,
    healthStatus: 'HEALTHY',
    isChronicFailure: false,
    installationDate: '2024-03-15',
    lastMaintenanceAt: '2026-02-10T14:00:00Z',
    nextMaintenanceDue: '2026-04-10T09:00:00Z',
    qrGeneratedAt: '2026-01-01T08:00:00Z',
    notes: 'Primary machine in headquarters lobby, high transaction velocity.',
    currentLocation: SEED_LOCATIONS[0],
    createdAt: '2024-03-15T10:00:00Z',
    updatedAt: '2026-02-10T14:00:00Z'
  },
  {
    id: 'mch-002',
    publicId: 'VM-C7D4E1',
    publicQrId: 'QR-C7D4E1-KSU-02',
    machineNumber: 'VM-B01-F02-02',
    serialNumber: 'SN-2024-99120',
    modelId: 'mdl-002',
    machineType: 'Bean-to-Cup Espresso',
    status: 'WARNING',
    dataQualityStatus: 'VALID',
    healthScore: 78,
    healthStatus: 'DEGRADED',
    isChronicFailure: false,
    installationDate: '2024-04-01',
    lastMaintenanceAt: '2026-01-20T11:00:00Z',
    nextMaintenanceDue: '2026-03-01T10:00:00Z',
    qrGeneratedAt: '2026-01-01T08:00:00Z',
    notes: 'Coffee brewer pressure transducer showing intermittent variance.',
    currentLocation: SEED_LOCATIONS[1],
    createdAt: '2024-04-01T09:00:00Z',
    updatedAt: '2026-02-22T08:30:00Z'
  },
  {
    id: 'mch-003',
    publicId: 'VM-F3G2H9',
    publicQrId: 'QR-F3G2H9-KSU-03',
    machineNumber: 'VM-B02-F01-01',
    serialNumber: 'SN-2024-31045',
    modelId: 'mdl-001',
    machineType: 'Combination Snack & Soda',
    status: 'UNDER_MAINTENANCE',
    dataQualityStatus: 'VALID',
    healthScore: 54,
    healthStatus: 'DEGRADED',
    isChronicFailure: false,
    installationDate: '2024-05-10',
    lastMaintenanceAt: '2026-02-24T16:00:00Z',
    nextMaintenanceDue: '2026-02-28T12:00:00Z',
    qrGeneratedAt: '2026-01-01T08:00:00Z',
    notes: 'POS contactless reader jammed after power surge.',
    currentLocation: SEED_LOCATIONS[2],
    createdAt: '2024-05-10T11:00:00Z',
    updatedAt: '2026-02-24T16:00:00Z'
  },
  {
    id: 'mch-004',
    publicId: 'VM-J8K1L5',
    publicQrId: 'QR-J8K1L5-KSU-04',
    machineNumber: 'VM-B02-F02-02',
    serialNumber: 'SN-2024-77219',
    modelId: 'mdl-003',
    machineType: 'Cold Beverage Can Dispenser',
    status: 'OPERATIONAL',
    dataQualityStatus: 'VALID',
    healthScore: 92,
    healthStatus: 'HEALTHY',
    isChronicFailure: false,
    installationDate: '2024-06-01',
    lastMaintenanceAt: '2026-02-05T09:00:00Z',
    nextMaintenanceDue: '2026-05-05T09:00:00Z',
    qrGeneratedAt: '2026-01-01T08:00:00Z',
    notes: 'Clean operation, excellent refrigeration efficiency.',
    currentLocation: SEED_LOCATIONS[3],
    createdAt: '2024-06-01T08:00:00Z',
    updatedAt: '2026-02-05T09:00:00Z'
  },
  {
    id: 'mch-005',
    publicId: 'VM-M4N9P2',
    publicQrId: 'QR-M4N9P2-KSU-05',
    machineNumber: 'VM-B03-F01-01',
    serialNumber: 'SN-2024-60144',
    modelId: 'mdl-001',
    machineType: 'Combination Snack & Soda',
    status: 'WARNING',
    dataQualityStatus: 'VALID',
    healthScore: 68,
    healthStatus: 'DEGRADED',
    isChronicFailure: true,
    installationDate: '2024-07-20',
    lastMaintenanceAt: '2026-02-25T11:45:00Z',
    nextMaintenanceDue: '2026-02-27T18:00:00Z',
    qrGeneratedAt: '2026-01-01T08:00:00Z',
    notes: 'Critical refrigeration system temperature spike (+14°C). Compressors parts on order.',
    currentLocation: SEED_LOCATIONS[4],
    createdAt: '2024-07-20T10:00:00Z',
    updatedAt: '2026-02-25T12:00:00Z'
  },
  {
    id: 'mch-006',
    publicId: 'VM-Q5R8S3',
    publicQrId: 'QR-Q5R8S3-KSU-06',
    machineNumber: 'VM-B03-F03-02',
    serialNumber: 'SN-2024-55198',
    modelId: 'mdl-002',
    machineType: 'Bean-to-Cup Espresso',
    status: 'OPERATIONAL',
    dataQualityStatus: 'VALID',
    healthScore: 94,
    healthStatus: 'HEALTHY',
    isChronicFailure: false,
    installationDate: '2024-09-01',
    lastMaintenanceAt: '2026-02-20T10:30:00Z',
    nextMaintenanceDue: '2026-04-20T09:00:00Z',
    qrGeneratedAt: '2026-01-01T08:00:00Z',
    notes: 'Located in ICU visitor lounge. Clean water filtration system replaced recently.',
    currentLocation: SEED_LOCATIONS[5],
    createdAt: '2024-09-01T09:00:00Z',
    updatedAt: '2026-02-20T11:00:00Z'
  },
  {
    id: 'mch-007',
    publicId: 'VM-X2Y7Z1',
    publicQrId: 'QR-X2Y7Z1-KSU-07',
    machineNumber: 'VM-B04-F01-01',
    serialNumber: 'SN-2024-44589',
    modelId: 'mdl-003',
    machineType: 'Smart Cold Beverage',
    status: 'OPERATIONAL',
    dataQualityStatus: 'VALID',
    healthScore: 89,
    healthStatus: 'HEALTHY',
    isChronicFailure: false,
    installationDate: '2024-10-15',
    lastMaintenanceAt: '2026-01-30T10:00:00Z',
    nextMaintenanceDue: '2026-03-30T09:00:00Z',
    qrGeneratedAt: '2026-01-01T08:00:00Z',
    notes: 'Heavy footfall zone in 24/7 library.',
    currentLocation: SEED_LOCATIONS[6],
    createdAt: '2024-10-15T11:00:00Z',
    updatedAt: '2026-01-30T10:00:00Z'
  }
];

export const SEED_TECHNICIANS: Technician[] = [
  {
    id: 'tch-001',
    userId: 'usr-tech-01',
    employeeCode: 'TECH-8012',
    fullName: 'Tariq Al-Mansoor',
    email: 'tariq.mansoor@fleetvending.com',
    specialization: 'Refrigeration & Power Systems',
    status: 'AVAILABLE',
    phoneNumber: '+966-50-5558012',
    skills: ['HVAC Certified', 'Compressor Rebuild', 'MDB Telemetry', 'Nayax POS', 'Electrical Diagnostics'],
    assignedRegion: 'Central Campus / Medical Sector',
    maxDailyCapacity: 6,
    maxActiveTickets: 6,
    kpis: {
      technicianId: 'tch-001',
      responseTimeMinutes: 14.5,
      repairTimeMinutes: 38.0,
      completedTickets: 34,
      firstTimeFixRate: 94.1,
      slaComplianceRate: 97.2,
      activeTicketsCount: 1,
      totalLaborMinutes: 1290,
      partsReplacedCount: 18,
      rating: 4.9
    },
    createdAt: '2024-01-15T08:00:00Z'
  },
  {
    id: 'tch-002',
    userId: 'usr-tech-02',
    employeeCode: 'TECH-8015',
    fullName: 'Ibrahim Al-Ghamdi',
    email: 'ibrahim.ghamdi@fleetvending.com',
    specialization: 'Espresso Machines & Hydraulics',
    status: 'BUSY',
    phoneNumber: '+966-50-5558015',
    skills: ['Espresso Calibration', 'Boiler Descaling', 'Water Filtration', 'PCB Diagnostics', 'Flow Meter Tuning'],
    assignedRegion: 'North University / Engineering',
    maxDailyCapacity: 5,
    maxActiveTickets: 5,
    kpis: {
      technicianId: 'tch-002',
      responseTimeMinutes: 18.2,
      repairTimeMinutes: 45.5,
      completedTickets: 28,
      firstTimeFixRate: 92.8,
      slaComplianceRate: 95.0,
      activeTicketsCount: 2,
      totalLaborMinutes: 1180,
      partsReplacedCount: 12,
      rating: 4.8
    },
    createdAt: '2024-02-01T08:00:00Z'
  },
  {
    id: 'tch-003',
    userId: 'usr-tech-03',
    employeeCode: 'TECH-8019',
    fullName: 'Ziyad Al-Harbi',
    email: 'ziyad.harbi@fleetvending.com',
    specialization: 'Telemetry, Nayax POS & Electronics',
    status: 'AVAILABLE',
    phoneNumber: '+966-50-5558019',
    skills: ['Nayax VPOS', 'Cash Flow 7900', 'Touch Screen Interface', 'Firmware Updates', 'NFC Calibration'],
    assignedRegion: 'Headquarters & Executive Buildings',
    maxDailyCapacity: 6,
    maxActiveTickets: 6,
    kpis: {
      technicianId: 'tch-003',
      responseTimeMinutes: 11.0,
      repairTimeMinutes: 29.0,
      completedTickets: 42,
      firstTimeFixRate: 95.2,
      slaComplianceRate: 98.0,
      activeTicketsCount: 1,
      totalLaborMinutes: 1218,
      partsReplacedCount: 15,
      rating: 4.95
    },
    createdAt: '2024-03-01T08:00:00Z'
  }
];

export const SEED_SPARE_CATEGORIES: SparePartCategory[] = [
  { id: 'cat-001', name: 'Payment & POS Systems', nameAr: 'أنظمة الدفع وأجهزة مدى والعملات', description: 'Credit card readers, coin acceptors, bill validators' },
  { id: 'cat-002', name: 'Motors & Spiral Dispensing', nameAr: 'المحركات والحلزونات وحساسات السقوط', description: 'Spiral delivery motors, optical drop sensors, harness cables' },
  { id: 'cat-003', name: 'Refrigeration & Temperature', nameAr: 'التبريد والكمبروسرات وحساسات الحرارة', description: 'Compressors, condenser fans, thermostats, eco-refrigerants' },
  { id: 'cat-004', name: 'Coffee Brewing & Hydraulics', nameAr: 'مجموعات تحضير القهوة والمضخات والغلايات', description: 'Espresso brew units, solenoid valves, flow meters, water filters' },
  { id: 'cat-005', name: 'Display, Keypads & Glass', nameAr: 'الشاشات ولوحات المفاتيح والزجاج', description: 'Touch screens, LCD displays, membrane keypads, LED strips' }
];

export const SEED_SPARE_PARTS: SparePart[] = [
  {
    id: 'prt-001',
    partNumber: 'SP-VAL-001',
    name: 'Nayax VPOS Touch Contactless Reader Kit',
    nameAr: 'قارئ بطاقات الدفع الذاتي ناياكس مع شاشة لمس',
    categoryId: 'cat-001',
    category: SEED_SPARE_CATEGORIES[0],
    manufacturer: 'Nayax Ltd',
    compatibleModels: ['RoboVendor Pro 500', 'BaristaTouch', 'HydroPure'],
    unit: 'PCS',
    currentQuantity: 3,
    minStockLevel: 5,
    maxStockLevel: 25,
    unitCost: 285.00,
    storageLocation: 'Shelf A-02 / Bin 04',
    isActive: true,
    createdAt: '2024-01-20T08:00:00Z'
  },
  {
    id: 'prt-002',
    partNumber: 'SP-MTR-014',
    name: '24V DC Spiral Dispenser Motor with Home Switch',
    nameAr: 'محرك حلزوني 24 فولت مع مفتاح توجيه',
    categoryId: 'cat-002',
    category: SEED_SPARE_CATEGORIES[1],
    manufacturer: 'Fas International',
    compatibleModels: ['RoboVendor Pro 500'],
    unit: 'PCS',
    currentQuantity: 18,
    minStockLevel: 8,
    maxStockLevel: 50,
    unitCost: 38.50,
    storageLocation: 'Shelf B-01 / Bin 12',
    isActive: true,
    createdAt: '2024-01-20T08:00:00Z'
  },
  {
    id: 'prt-003',
    partNumber: 'SP-REF-088',
    name: '1/3 HP Eco R290 Hermetic Compressor 220V',
    nameAr: 'ضاغط تبريد محكم 1/3 حصان غاز صديق للبيئة R290',
    categoryId: 'cat-003',
    category: SEED_SPARE_CATEGORIES[2],
    manufacturer: 'Secop / Embraco',
    compatibleModels: ['RoboVendor Pro 500', 'HydroPure Smart'],
    unit: 'PCS',
    currentQuantity: 2,
    minStockLevel: 4,
    maxStockLevel: 12,
    unitCost: 195.00,
    storageLocation: 'Shelf D-04 / Floor Pallet 02',
    isActive: true,
    createdAt: '2024-02-15T08:00:00Z'
  },
  {
    id: 'prt-004',
    partNumber: 'SP-HYD-042',
    name: 'Ulka EX5 High Pressure Vibratory Water Pump',
    nameAr: 'مضخة ماء ضغط عالي أولكا 15 بار',
    categoryId: 'cat-004',
    category: SEED_SPARE_CATEGORIES[3],
    manufacturer: 'Ceme / Ulka',
    compatibleModels: ['BaristaTouch Espresso'],
    unit: 'PCS',
    currentQuantity: 12,
    minStockLevel: 6,
    maxStockLevel: 30,
    unitCost: 45.00,
    storageLocation: 'Shelf C-03 / Bin 08',
    isActive: true,
    createdAt: '2024-02-20T08:00:00Z'
  },
  {
    id: 'prt-005',
    partNumber: 'SP-FLT-009',
    name: 'Brita Purity C150 Quell ST Water Filter Cartridge',
    nameAr: 'فلتر تنقية مياه بريتا المخصص لمكائن القهوة',
    categoryId: 'cat-004',
    category: SEED_SPARE_CATEGORIES[3],
    manufacturer: 'Brita Professional',
    compatibleModels: ['BaristaTouch Espresso'],
    unit: 'PCS',
    currentQuantity: 14,
    minStockLevel: 8,
    maxStockLevel: 40,
    unitCost: 65.00,
    storageLocation: 'Shelf C-01 / Bin 02',
    isActive: true,
    createdAt: '2024-03-01T08:00:00Z'
  },
  {
    id: 'prt-006',
    partNumber: 'SP-SEN-021',
    name: 'Optical Drop Sensor Beam Receiver Bar',
    nameAr: 'حساس سقوط المنتج الضوئي السفلي',
    categoryId: 'cat-002',
    category: SEED_SPARE_CATEGORIES[1],
    manufacturer: 'Sanden Vendo',
    compatibleModels: ['RoboVendor Pro 500', 'HydroPure Smart'],
    unit: 'PCS',
    currentQuantity: 9,
    minStockLevel: 5,
    maxStockLevel: 20,
    unitCost: 52.00,
    storageLocation: 'Shelf B-02 / Bin 05',
    isActive: true,
    createdAt: '2024-03-10T08:00:00Z'
  }
];

export const SEED_TICKETS: Ticket[] = [
  {
    id: 'tck-001',
    ticketNumber: 'TCK-2026-0001',
    machineId: 'mch-005',
    machine: SEED_MACHINES[4],
    locationId: 'loc-005',
    location: SEED_LOCATIONS[4],
    source: 'SYSTEM_ALERT',
    category: 'REFRIGERATION',
    priority: 'CRITICAL',
    status: 'WAITING_FOR_PART',
    description: 'Internal temperature exceeded critical threshold (+14°C). Condenser fan operational but compressor not engaging.',
    reporterName: 'Automated Telemetry Alert',
    assignedTechnicianId: 'tch-001',
    assignedTechnician: SEED_TECHNICIANS[0],
    isRecurring: true,
    recurringOccurrenceCount: 3,
    slaDueAt: '2026-02-27T18:00:00Z',
    triagedAt: '2026-02-25T11:05:00Z',
    acknowledgedAt: '2026-02-25T11:10:00Z',
    startedAt: '2026-02-25T11:45:00Z',
    totalPartsCost: 195.00,
    timeline: [
      {
        id: 'tl-101',
        ticketId: 'tck-001',
        timestamp: '2026-02-25T11:00:00Z',
        action: 'CREATED',
        actionLabel: 'Incident Triggered',
        description: 'Automated IoT telemetry detected cabinet temperature spike (>14°C for 25 mins).'
      },
      {
        id: 'tl-102',
        ticketId: 'tck-001',
        timestamp: '2026-02-25T11:05:00Z',
        action: 'TRIAGED',
        actionLabel: 'Incident Triaged',
        description: 'Auto-triaged as CRITICAL priority. SLA target set to 4 hours.'
      }
    ],
    attachments: [],
    notes: [],
    statusHistory: [],
    createdAt: '2026-02-25T11:00:00Z',
    updatedAt: '2026-02-25T12:30:00Z'
  }
];

export const SEED_SUPPLIERS: Supplier[] = [
  {
    id: 'sup-001',
    name: 'Nayax Middle East FZ-LLC',
    contactPerson: 'Kareem Mansour',
    email: 'kareem.m@nayax.com',
    phone: '+971 4 800 6292',
    address: 'Dubai Internet City, Building 3',
    leadTimeDays: 3,
    rating: 4.9,
    isActive: true,
    createdAt: '2024-01-10T08:00:00Z'
  },
  {
    id: 'sup-002',
    name: 'Gulf Vending & Catering Equipment Trading',
    contactPerson: 'Abdullah Al-Dosari',
    email: 'sales@gulfvending.sa',
    phone: '+966 11 445 8890',
    address: 'Al-Kharj Road Industrial Zone, Riyadh',
    leadTimeDays: 2,
    rating: 4.7,
    isActive: true,
    createdAt: '2024-01-12T08:00:00Z'
  },
  {
    id: 'sup-003',
    name: 'Evoca Group & Necta Parts Distribution',
    contactPerson: 'Marco Valenti',
    email: 'orders.mideast@evocagroup.com',
    phone: '+39 035 606 111',
    address: 'Valbrembo (BG), Italy',
    leadTimeDays: 7,
    rating: 4.8,
    isActive: true,
    createdAt: '2024-01-15T08:00:00Z'
  }
];

export const SEED_PART_REQUESTS: SparePartRequest[] = [
  {
    id: 'req-001',
    ticketId: 'tck-001',
    technicianId: 'tch-001',
    technician: SEED_TECHNICIANS[0],
    partId: 'prt-003',
    part: SEED_SPARE_PARTS[2],
    quantity: 1,
    priority: 'CRITICAL',
    status: 'APPROVED',
    reason: 'Compressor stator winding shorted on VM-B03-F01-01 (Medical City ER).',
    createdAt: '2026-02-25T12:00:00Z'
  }
];

export const SEED_TRANSACTIONS: InventoryTransaction[] = [
  {
    id: 'tx-001',
    partId: 'prt-001',
    part: SEED_SPARE_PARTS[0],
    transactionType: 'RECEIVE',
    quantityDelta: 10,
    balanceAfter: 15,
    unitPrice: 285.00,
    performedBy: 'Yousef Al-Harbi (Warehouse)',
    notes: 'PO-2026-881 received from Nayax ME',
    createdAt: '2026-02-15T09:00:00Z'
  }
];

export const SEED_USERS: User[] = [];

export const SEED_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'aud-001',
    userId: 'system',
    action: 'SYSTEM_INITIALIZED',
    entityName: 'System',
    entityId: 'ROOT',
    newValues: { message: 'تهيئة منظومة إدارة وصيانة أسطول أجهزة البيع الذاتي' },
    createdAt: new Date().toISOString()
  }
];

export const SEED_IMPORT_BATCHES: ImportBatch[] = [
  {
    id: 'imp-batch-001',
    fileName: 'Campus_Deployment_Baseline_2025.xlsx',
    fileSizeBytes: 34500,
    fileHashSha256: 'sha256-e4d3c2b1a0987654',
    importedBy: 'Sultan Al-Otaibi (Super Admin)',
    totalColumnsDetected: 8,
    totalRecordsCreated: 8,
    validCount: 7,
    reviewRequiredCount: 1,
    invalidRecordsCount: 0,
    summaryReport: {
      totalRows: 8,
      validRows: 7,
      reviewRequiredRows: 1,
      duplicateRows: 0,
      errorRows: 0
    },
    createdAt: '2025-11-15T09:30:00Z'
  }
];

export const SEED_IMPORT_ROWS: ImportRowEntity[] = [
  {
    id: 'imp-row-001',
    importId: 'imp-batch-001',
    sourceSheet: 'Sheet1',
    sourceColumn: 'A',
    sourceRow: 2,
    originalMachineNumber: 'VM-B01-F01-01',
    originalSerialNumber: 'SN-2024-88491',
    originalBuilding: 'Main Administration Complex',
    originalLocation: 'Ground Floor Lobby West Gate',
    normalizedMachineId: 'VM-B01-F01-01',
    dataQualityStatus: 'VALID',
    detectedIssues: [],
    createdAt: '2025-11-15T09:30:00Z'
  }
];

export function generateMasterFleetDataset() {
  const buildings: Building[] = [
    { id: 'bld-001', name: 'Main Administration Complex', nameAr: 'مجمع الإدارة الرئيسي', code: 'BLD-HQ', address: 'King Fahd Road, Business District', createdAt: '2026-01-10T08:00:00Z', updatedAt: '2026-01-10T08:00:00Z' },
    { id: 'bld-002', name: 'College of Engineering & Computing', nameAr: 'كلية الهندسة والحاسب الآلي', code: 'BLD-ENG', address: 'North University Campus, Gate 4', createdAt: '2026-01-12T09:00:00Z', updatedAt: '2026-01-12T09:00:00Z' },
    { id: 'bld-003', name: 'Medical City & Teaching Hospital', nameAr: 'المدينة الطبية والمستشفى الجامعي', code: 'BLD-MED', address: 'Health Sciences Boulevard', createdAt: '2026-01-15T10:00:00Z', updatedAt: '2026-01-15T10:00:00Z' },
    { id: 'bld-004', name: 'Central Library & Student Hub', nameAr: 'المكتبة المركزية ومركز الأنشطة الطلابية', code: 'BLD-LIB', address: 'University Square', createdAt: '2026-01-18T11:00:00Z', updatedAt: '2026-01-18T11:00:00Z' },
    { id: 'bld-005', name: 'College of Science & Research Labs', nameAr: 'كلية العلوم ومختبرات الأبحاث', code: 'BLD-SCI', address: 'Science Park East Wing', createdAt: '2026-01-20T08:00:00Z', updatedAt: '2026-01-20T08:00:00Z' },
    { id: 'bld-006', name: 'College of Business Administration', nameAr: 'كلية إدارة الأعمال', code: 'BLD-CBA', address: 'Academic Quadrangle South', createdAt: '2026-01-22T08:00:00Z', updatedAt: '2026-01-22T08:00:00Z' },
    { id: 'bld-007', name: 'College of Medicine & Surgery', nameAr: 'كلية الطب البشري والجراحة', code: 'BLD-MED-COL', address: 'Medical Quad East', createdAt: '2026-01-25T08:00:00Z', updatedAt: '2026-01-25T08:00:00Z' },
    { id: 'bld-008', name: 'College of Pharmacy & Pharmacology', nameAr: 'كلية الصيدلة والعلوم الصيدلانية', code: 'BLD-PHARM', address: 'Health Science Corridor', createdAt: '2026-01-26T08:00:00Z', updatedAt: '2026-01-26T08:00:00Z' },
    { id: 'bld-009', name: 'Sports & Student Activity Complex', nameAr: 'مجمع الأنشطة الرياضية والطلابية', code: 'BLD-SPORT', address: 'Campus Recreation Zone', createdAt: '2026-01-28T08:00:00Z', updatedAt: '2026-01-28T08:00:00Z' },
    { id: 'bld-010', name: 'Common First Year Deanship', nameAr: 'عمادة السنة الأولى المشتركة', code: 'BLD-CFY', address: 'Freshman Academic Center', createdAt: '2026-01-30T08:00:00Z', updatedAt: '2026-01-30T08:00:00Z' },
    { id: 'bld-011', name: 'University Dental Hospital', nameAr: 'المستشفى الجامعي لطب الأسنان', code: 'BLD-DENT', address: 'Hospital Complex North', createdAt: '2026-02-01T08:00:00Z', updatedAt: '2026-02-01T08:00:00Z' },
    { id: 'bld-012', name: 'Technology Innovation & AI Center', nameAr: 'مركز الابتكار التقني والذكاء الاصطناعي', code: 'BLD-TECH', address: 'Innovation Park Gate 1', createdAt: '2026-02-05T08:00:00Z', updatedAt: '2026-02-05T08:00:00Z' }
  ];

  const floorTemplates = [
    { name: 'Ground Floor Lobby', nameAr: 'الدور الأرضي - البهو الرئيسي', level: 0 },
    { name: 'First Floor - Hallways', nameAr: 'الدور الأول - الممرات', level: 1 },
    { name: 'Second Floor - Academic Wing', nameAr: 'الدور الثاني - الجناح الأكاديمي', level: 2 },
    { name: 'Third Floor - Executive / Labs', nameAr: 'الدور الثالث - المعامل', level: 3 },
    { name: 'Basement - Services & Parking', nameAr: 'القبو - منطقة الخدمات', level: -1 }
  ];

  const zoneTemplates = [
    { zone: 'Main Entrance & Reception', zoneAr: 'المدخل الرئيسي والاستقبال' },
    { zone: 'Cafeteria & Dining Lounge', zoneAr: 'صالة الكافتيريا والاستراحة' },
    { zone: 'Elevator & Stairwell Hallway', zoneAr: 'ممر المصاعد والسلالم' },
    { zone: 'Student Study Area', zoneAr: 'منطقة دراسة واستراحة الطلاب' },
    { zone: 'East Wing Lecture Halls', zoneAr: 'قاعات الجناح الشرقي' },
    { zone: 'West Wing Labs Corridor', zoneAr: 'ممر مختبرات الجناح الغربي' },
    { zone: 'Faculty & Staff Lounge', zoneAr: 'استراحة أعضاء هيئة التدريس' },
    { zone: 'Waiting Hall & Terrace', zoneAr: 'صالة الانتظار والشرفة' }
  ];

  const floors: Floor[] = [];
  const locations: Location[] = [];

  buildings.forEach((bld, bIdx) => {
    floorTemplates.forEach((ft, fIdx) => {
      const flrId = `flr-${String(bIdx + 1).padStart(3, '0')}-${fIdx + 1}`;
      const flr: Floor = {
        id: flrId,
        buildingId: bld.id,
        floorName: ft.name,
        floorNameAr: ft.nameAr,
        levelOrder: ft.level,
        isActive: true,
        isDeleted: false,
        createdAt: '2026-01-10T08:00:00Z'
      };
      floors.push(flr);

      for (let z = 0; z < 2; z++) {
        const zIdx = (fIdx * 2 + z) % zoneTemplates.length;
        const zTemplate = zoneTemplates[zIdx];
        const locId = `loc-${String(bIdx + 1).padStart(3, '0')}-${fIdx + 1}-${z + 1}`;
        locations.push({
          id: locId,
          buildingId: bld.id,
          floorId: flrId,
          areaZone: zTemplate.zone,
          areaZoneAr: zTemplate.zoneAr,
          fullDescription: `${bld.name} > ${ft.name} > ${zTemplate.zone}`,
          isActive: true,
          isDeleted: false,
          building: bld,
          floor: flr,
          createdAt: '2026-01-10T08:00:00Z'
        });
      }
    });
  });

  const machineTypes = [
    'Hot Beverages & Specialty Coffee',
    'Cold Snacks & Drinks Combo',
    'Bean-to-Cup Espresso Pro',
    'Smart Combination Vending Unit',
    'Cold Bottled Drinks Dispenser'
  ];

  const maintenanceIndices = new Set<number>();
  let curr = 2;
  while (maintenanceIndices.size < 57 && curr <= 189) {
    maintenanceIndices.add(curr);
    curr += (curr % 3 === 0 ? 4 : 3);
  }
  for (let i = 1; i <= 189 && maintenanceIndices.size < 57; i++) {
    if (i % 3 === 0 && maintenanceIndices.size < 57) maintenanceIndices.add(i);
  }

  const machines: Machine[] = [];
  const tickets: Ticket[] = [];

  const faultCategories: FaultCategory[] = ['REFRIGERATION', 'CARD_READER', 'PRODUCT_DISPENSING', 'MECHANICAL', 'POWER', 'SOFTWARE', 'OTHER'];
  const priorities: TicketPriority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const faultDescriptions = [
    'Compressor temperature alert: Cooling chamber reached +12°C',
    'Nayax POS MDB terminal timeout - card payments declining',
    'Spiral motor 3 jammed on snack tray 2',
    'High pressure espresso boiler steam leak / flow meter warning',
    'Bill validator optical sensor blocked or rejecting valid notes',
    'DEX telemetry heartbeat offline for > 48 hours',
    'Cup dispensing mechanism misaligned / chute sensor stuck'
  ];

  for (let i = 1; i <= 189; i++) {
    const isMaint = maintenanceIndices.has(i);
    const mNumber = String(i);
    const loc = locations[(i - 1) % locations.length];
    const mType = machineTypes[(i - 1) % machineTypes.length];
    const modelId = `mdl-${String(((i - 1) % 3) + 1).padStart(3, '0')}`;
    
    let sNum = `SN-2026-${String(90000 + i)}`;
    let qualityStatus: DataQualityStatus = 'VALID';

    if (i === 14 || i === 38 || i === 105) {
      sNum = '';
      qualityStatus = 'REVIEW_REQUIRED';
    } else if (i === 72) {
      sNum = 'N/A';
      qualityStatus = 'REVIEW_REQUIRED';
    } else if (i === 22) {
      sNum = '000000';
      qualityStatus = 'REVIEW_REQUIRED';
    } else if (i === 55) {
      sNum = '12345';
      qualityStatus = 'REVIEW_REQUIRED';
    } else if (i === 64 || i === 65) {
      sNum = 'SN-2026-90064';
      qualityStatus = 'REVIEW_REQUIRED';
    }

    const machineStatus: MachineStatus = isMaint ? (i % 4 === 0 ? 'WARNING' : 'UNDER_MAINTENANCE') : 'OPERATIONAL';
    const healthScore = isMaint ? (i % 4 === 0 ? 68 : 42) : Math.min(100, 88 + (i % 12));
    const healthStatus = isMaint ? (i % 4 === 0 ? 'WARNING' : 'CRITICAL') : 'HEALTHY';

    const mch: Machine = {
      id: `mch-${i}`,
      publicId: `VM-${i}`,
      publicQrId: `QR-KSU-${i}`,
      machineNumber: mNumber,
      serialNumber: sNum,
      modelId,
      machineType: mType,
      status: machineStatus,
      dataQualityStatus: qualityStatus,
      healthScore,
      healthStatus,
      isChronicFailure: isMaint && i % 5 === 0,
      installationDate: '2024-03-15',
      lastMaintenanceAt: isMaint ? '2026-02-20T10:00:00Z' : '2026-02-10T14:00:00Z',
      nextMaintenanceDue: '2026-04-10T09:00:00Z',
      qrGeneratedAt: '2026-01-01T08:00:00Z',
      currentLocation: loc,
      createdAt: '2024-03-15T10:00:00Z',
      updatedAt: '2026-02-20T14:00:00Z'
    };

    machines.push(mch);

    if (isMaint) {
      const ticketNum = `TCK-2026-${String(tickets.length + 1).padStart(4, '0')}`;
      const fCat = faultCategories[i % faultCategories.length];
      const fPri = priorities[i % priorities.length];
      const desc = faultDescriptions[i % faultDescriptions.length];
      const tech = SEED_TECHNICIANS[i % SEED_TECHNICIANS.length];
      const now = '2026-02-26T08:00:00Z';

      const tck: Ticket = {
        id: `tck-${tickets.length + 1}`,
        ticketNumber: ticketNum,
        title: `Machine #${mNumber} - ${desc.split(':')[0]}`,
        machineId: mch.id,
        machine: mch,
        locationId: loc.id,
        location: loc,
        source: i % 2 === 0 ? 'SYSTEM_ALERT' : 'CUSTOMER_QR',
        category: fCat,
        priority: fPri,
        status: i % 3 === 0 ? 'IN_PROGRESS' : (i % 2 === 0 ? 'ASSIGNED' : 'NEW'),
        description: `${desc} on machine #${mNumber} located at ${loc.fullDescription}`,
        assignedTechnicianId: tech.id,
        assignedTechnician: tech,
        reporterName: 'Automated Diagnostic / Field Monitor',
        isRecurring: i % 5 === 0,
        recurringOccurrenceCount: i % 5 === 0 ? 3 : 1,
        slaDueAt: new Date(Date.now() + 6 * 3600000).toISOString(),
        totalPartsCost: 0,
        timeline: [
          {
            id: `tl-seed-${i}-1`,
            ticketId: `tck-${tickets.length + 1}`,
            timestamp: now,
            action: 'CREATED',
            actionLabel: 'Ticket Opened',
            description: `Automated fault alert logged for Machine #${mNumber}.`
          },
          {
            id: `tl-seed-${i}-2`,
            ticketId: `tck-${tickets.length + 1}`,
            timestamp: now,
            technicianId: tech.id,
            technicianName: tech.fullName,
            technicianCode: tech.employeeCode,
            action: 'ASSIGNED',
            actionLabel: 'Dispatched to Tech',
            description: `Assigned to ${tech.fullName} (${tech.specialization}).`
          }
        ],
        createdAt: now,
        updatedAt: now
      };
      tickets.push(tck);
    }
  }

  return {
    buildings,
    floors,
    locations,
    machines,
    tickets
  };
}
