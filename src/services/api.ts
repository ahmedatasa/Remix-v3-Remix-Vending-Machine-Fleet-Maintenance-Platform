import {
  Machine, Ticket, Location, Building, Floor, Technician, SparePart,
  SparePartCategory, InventoryTransaction, SparePartRequest, Supplier,
  AuditLog, User, UserRole, MachineModel, MachineStatus, TicketStatus, TicketPriority,
  FaultCategory, TechnicianStatus, PartRequestStatus, DataQualityStatus,
  ImportBatch, ImportRowEntity, NormalizedMachineRecord, ImportCommitOptions,
  MaintenanceAction, TicketAttachment, TicketNote, TicketTimelineItem, TechnicianKPIs,
  InventoryTransactionType, TransactionType, MachinePartHistoryRecord, PartUsageRecord
} from '../types';
import { normalizeExplicitLocationSource } from '../utils/geoValidation';

const API_BASE_URL = '/api/v1';

// Initial Seed Data Mirroring Database Schema
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
    importProvenance: {
      importBatchId: 'imp-batch-001',
      sourceFile: 'تقرير_الماكينات_20260826_2313.xlsx',
      sourceSheet: 'الماكينات',
      sourceRow: 2,
      originalSourceValues: {
        rawMachineNumber: 'VM-B01-F01-01',
        rawSerialNumber: 'SN-2024-88491',
        rawBuilding: 'Main Administration Complex',
        rawFloor: 'Ground Floor',
        rawLocation: 'Ground Floor Lobby West Gate',
        rawType: 'Combination Snack & Soda',
        rawStatus: 'OPERATIONAL'
      },
      initialQualityAssessment: 'VALID',
      normalizedAt: '2026-01-10T08:00:00Z'
    },
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
    importProvenance: {
      importBatchId: 'imp-batch-001',
      sourceFile: 'تقرير_الماكينات_20260826_2313.xlsx',
      sourceSheet: 'الماكينات',
      sourceRow: 3,
      originalSourceValues: {
        rawMachineNumber: 'VM-B01-F02-02',
        rawSerialNumber: 'SN-2024-99120',
        rawBuilding: 'Main Administration Complex',
        rawFloor: 'First Floor',
        rawLocation: 'First Floor Executive Lounge Hallway',
        rawType: 'Bean-to-Cup Espresso',
        rawStatus: 'WARNING'
      },
      initialQualityAssessment: 'VALID',
      normalizedAt: '2026-01-10T08:00:00Z'
    },
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
    importProvenance: {
      importBatchId: 'imp-batch-001',
      sourceFile: 'تقرير_الماكينات_20260826_2313.xlsx',
      sourceSheet: 'الماكينات',
      sourceRow: 4,
      originalSourceValues: {
        rawMachineNumber: 'VM-B02-F01-01',
        rawSerialNumber: 'SN-2024-31045',
        rawBuilding: 'College of Engineering',
        rawFloor: 'Ground Floor',
        rawLocation: 'Ground Floor Atrium > Cafeteria Corridor',
        rawType: 'Combination Snack & Soda',
        rawStatus: 'UNDER_MAINTENANCE'
      },
      initialQualityAssessment: 'VALID',
      normalizedAt: '2026-01-10T08:00:00Z'
    },
    createdAt: '2024-05-10T10:00:00Z',
    updatedAt: '2026-02-24T16:00:00Z'
  },
  {
    id: 'mch-004',
    publicId: 'VM-K1L5M8',
    publicQrId: 'QR-K1L5M8-KSU-04',
    machineNumber: 'VM-B02-F02-02',
    serialNumber: 'SN-2024-55612',
    modelId: 'mdl-003',
    machineType: 'Smart Cold Beverage',
    status: 'OPERATIONAL',
    dataQualityStatus: 'VALID',
    healthScore: 92,
    healthStatus: 'HEALTHY',
    isChronicFailure: false,
    installationDate: '2024-06-20',
    lastMaintenanceAt: '2026-02-05T09:00:00Z',
    nextMaintenanceDue: '2026-04-05T09:00:00Z',
    qrGeneratedAt: '2026-01-01T08:00:00Z',
    notes: 'Smooth operation, cleaned condenser coils in last visit.',
    currentLocation: SEED_LOCATIONS[3],
    importProvenance: {
      importBatchId: 'imp-batch-001',
      sourceFile: 'تقرير_الماكينات_20260826_2313.xlsx',
      sourceSheet: 'الماكينات',
      sourceRow: 5,
      originalSourceValues: {
        rawMachineNumber: 'VM-B02-F02-02',
        rawSerialNumber: 'SN-2024-55612',
        rawBuilding: 'College of Engineering',
        rawFloor: 'Second Floor',
        rawLocation: 'Second Floor > Lab Wing 204 Waiting Area',
        rawType: 'Smart Cold Beverage',
        rawStatus: 'OPERATIONAL'
      },
      initialQualityAssessment: 'VALID',
      normalizedAt: '2026-01-10T08:00:00Z'
    },
    createdAt: '2024-06-20T10:00:00Z',
    updatedAt: '2026-02-05T09:00:00Z'
  },
  {
    id: 'mch-005',
    publicId: 'VM-P9Q4R2',
    publicQrId: 'QR-P9Q4R2-KSU-05',
    machineNumber: 'VM-B03-F01-01',
    serialNumber: 'SN-2024-77890',
    modelId: 'mdl-001',
    machineType: 'Combination Snack & Soda',
    status: 'OUT_OF_SERVICE',
    dataQualityStatus: 'REVIEW_REQUIRED',
    healthScore: 32,
    healthStatus: 'CRITICAL',
    isChronicFailure: true,
    chronicFailureReason: '3 critical refrigeration failures detected within last 30-day monitoring window',
    installationDate: '2024-08-12',
    lastMaintenanceAt: '2026-02-18T13:00:00Z',
    nextMaintenanceDue: '2026-02-27T08:00:00Z',
    lastFaultAt: '2026-02-25T11:00:00Z',
    qrGeneratedAt: '2026-01-01T08:00:00Z',
    notes: 'Refrigeration unit failure, waiting on compressor replacement part.',
    currentLocation: SEED_LOCATIONS[4],
    importProvenance: {
      importBatchId: 'imp-batch-001',
      sourceFile: 'تقرير_الماكينات_20260826_2313.xlsx',
      sourceSheet: 'الماكينات',
      sourceRow: 6,
      originalSourceValues: {
        rawMachineNumber: 'VM-B03-F01-01',
        rawSerialNumber: 'SN-2024-77890',
        rawBuilding: 'Medical City',
        rawFloor: 'Ground Floor',
        rawLocation: 'Ground Floor Emergency > ER Main Visitors Waiting Room',
        rawType: 'Combination Snack & Soda',
        rawStatus: 'OUT_OF_SERVICE'
      },
      initialQualityAssessment: 'REVIEW_REQUIRED',
      normalizedAt: '2026-01-10T08:00:00Z'
    },
    createdAt: '2024-08-12T10:00:00Z',
    updatedAt: '2026-02-25T11:00:00Z'
  },
  {
    id: 'mch-006',
    publicId: 'VM-T5U8V3',
    publicQrId: 'QR-T5U8V3-KSU-06',
    machineNumber: 'VM-B03-F03-02',
    serialNumber: 'SN-2024-11234',
    modelId: 'mdl-002',
    machineType: 'Bean-to-Cup Espresso',
    status: 'OPERATIONAL',
    dataQualityStatus: 'VALID',
    healthScore: 98,
    healthStatus: 'HEALTHY',
    isChronicFailure: false,
    installationDate: '2024-09-01',
    lastMaintenanceAt: '2026-02-12T15:00:00Z',
    nextMaintenanceDue: '2026-04-12T09:00:00Z',
    qrGeneratedAt: '2026-01-01T08:00:00Z',
    notes: 'Water filtration cartridge replaced on schedule.',
    currentLocation: SEED_LOCATIONS[5],
    importProvenance: {
      importBatchId: 'imp-batch-001',
      sourceFile: 'تقرير_الماكينات_20260826_2313.xlsx',
      sourceSheet: 'الماكينات',
      sourceRow: 7,
      originalSourceValues: {
        rawMachineNumber: 'VM-B03-F03-02',
        rawSerialNumber: 'SN-2024-11234',
        rawBuilding: 'Medical City',
        rawFloor: 'Third Floor',
        rawLocation: 'Third Floor > ICU Family Lounge North Corner',
        rawType: 'Bean-to-Cup Espresso',
        rawStatus: 'OPERATIONAL'
      },
      initialQualityAssessment: 'VALID',
      normalizedAt: '2026-01-10T08:00:00Z'
    },
    createdAt: '2024-09-01T09:00:00Z',
    updatedAt: '2026-02-12T15:00:00Z'
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
    importProvenance: {
      importBatchId: 'imp-batch-001',
      sourceFile: 'تقرير_الماكينات_20260826_2313.xlsx',
      sourceSheet: 'الماكينات',
      sourceRow: 8,
      originalSourceValues: {
        rawMachineNumber: 'VM-B04-F01-01',
        rawSerialNumber: 'SN-2024-44589',
        rawBuilding: 'Central Library',
        rawFloor: 'Ground Floor',
        rawLocation: 'Ground Floor > 24/7 Digital Learning Commons',
        rawType: 'Smart Cold Beverage',
        rawStatus: 'OPERATIONAL'
      },
      initialQualityAssessment: 'VALID',
      normalizedAt: '2026-01-10T08:00:00Z'
    },
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
      responseTimeMinutes: 14.5, // 14.5 min response
      repairTimeMinutes: 38.0,   // 38 min MTTR
      completedTickets: 34,
      firstTimeFixRate: 94.1,    // 94.1%
      slaComplianceRate: 97.2,   // 97.2%
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
      repairTimeMinutes: 44.5,
      completedTickets: 28,
      firstTimeFixRate: 89.3,
      slaComplianceRate: 92.8,
      activeTicketsCount: 1,
      totalLaborMinutes: 1240,
      partsReplacedCount: 12,
      rating: 4.8
    },
    createdAt: '2024-02-10T08:00:00Z'
  },
  {
    id: 'tch-003',
    userId: 'usr-tech-03',
    employeeCode: 'TECH-8019',
    fullName: 'Ziyad Al-Harbi',
    email: 'ziyad.harbi@fleetvending.com',
    specialization: 'POS Payment & Telemetry Gateways',
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
    createdAt: '2024-03-01T08:00:00Z'
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
      },
      {
        id: 'tl-103',
        ticketId: 'tck-001',
        timestamp: '2026-02-25T11:08:00Z',
        technicianName: 'Tariq Al-Mansoor',
        technicianCode: 'TECH-8012',
        technicianId: 'tch-001',
        action: 'ASSIGNED',
        actionLabel: 'Assigned to Technician',
        description: 'Assigned to Tariq Al-Mansoor (Refrigeration & Power Systems Specialist).'
      },
      {
        id: 'tl-104',
        ticketId: 'tck-001',
        timestamp: '2026-02-25T11:10:00Z',
        technicianName: 'Tariq Al-Mansoor',
        technicianCode: 'TECH-8012',
        technicianId: 'tch-001',
        action: 'ACCEPTED',
        actionLabel: 'Ticket Accepted',
        description: 'Technician acknowledged dispatch and en route to Medical City ER.'
      },
      {
        id: 'tl-105',
        ticketId: 'tck-001',
        timestamp: '2026-02-25T11:45:00Z',
        technicianName: 'Tariq Al-Mansoor',
        technicianCode: 'TECH-8012',
        technicianId: 'tch-001',
        action: 'WORK_STARTED',
        actionLabel: 'On-Site Work Started',
        description: 'Arrived at unit. Opened maintenance hatch, tested voltage supply to compressor relay.'
      },
      {
        id: 'tl-106',
        ticketId: 'tck-001',
        timestamp: '2026-02-25T12:00:00Z',
        technicianName: 'Tariq Al-Mansoor',
        technicianCode: 'TECH-8012',
        technicianId: 'tch-001',
        action: 'ACTION_ADDED',
        actionLabel: 'Diagnostic Performed',
        description: 'Multimeter measurement shows open winding in compressor motor. Compressor seized.'
      },
      {
        id: 'tl-107',
        ticketId: 'tck-001',
        timestamp: '2026-02-25T12:05:00Z',
        technicianName: 'Tariq Al-Mansoor',
        technicianCode: 'TECH-8012',
        technicianId: 'tch-001',
        action: 'PHOTO_UPLOADED',
        actionLabel: 'Diagnostic Photo',
        description: 'Burned compressor terminal block photo uploaded.',
        attachment: {
          id: 'att-101',
          fileName: 'compressor-burnt-terminal.jpg',
          fileUrl: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=800&auto=format&fit=crop&q=60',
          fileType: 'image/jpeg',
          caption: 'Severe thermal overload visible on terminal connection'
        }
      },
      {
        id: 'tl-108',
        ticketId: 'tck-001',
        timestamp: '2026-02-25T12:15:00Z',
        technicianName: 'Tariq Al-Mansoor',
        technicianCode: 'TECH-8012',
        technicianId: 'tch-001',
        action: 'PART_REQUESTED',
        actionLabel: 'Requisition Filed',
        description: 'Requested replacement 1/3 HP Eco R290 Compressor (SP-REF-088) from Central Depot.',
        part: {
          partNumber: 'SP-REF-088',
          name: '1/3 HP Eco R290 Hermetic Compressor 220V',
          quantity: 1,
          unitCost: 195.00,
          status: 'PENDING'
        }
      }
    ],
    attachments: [
      {
        id: 'att-101',
        ticketId: 'tck-001',
        fileName: 'compressor-burnt-terminal.jpg',
        fileType: 'image/jpeg',
        fileUrl: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=800&auto=format&fit=crop&q=60',
        uploadedBy: 'Tariq Al-Mansoor',
        uploaderRole: 'TECHNICIAN',
        caption: 'Severe thermal overload visible on terminal connection',
        createdAt: '2026-02-25T12:05:00Z'
      }
    ],
    notes: [
      {
        id: 'nt-101',
        ticketId: 'tck-001',
        authorName: 'Tariq Al-Mansoor',
        authorRole: 'Technician',
        content: 'Perishable products in refrigerated section moved to temporary backup cooler on Level 1.',
        isInternal: true,
        createdAt: '2026-02-25T12:10:00Z'
      }
    ],
    statusHistory: [
      { id: 'sh-1', ticketId: 'tck-001', newStatus: 'NEW', createdAt: '2026-02-25T11:00:00Z' },
      { id: 'sh-2', ticketId: 'tck-001', previousStatus: 'NEW', newStatus: 'TRIAGED', comment: 'Auto-triaged by alert engine', createdAt: '2026-02-25T11:05:00Z' },
      { id: 'sh-3', ticketId: 'tck-001', previousStatus: 'TRIAGED', newStatus: 'ASSIGNED', comment: 'Assigned to Tariq Al-Mansoor', createdAt: '2026-02-25T11:08:00Z' },
      { id: 'sh-4', ticketId: 'tck-001', previousStatus: 'ASSIGNED', newStatus: 'IN_PROGRESS', comment: 'Work started on-site', createdAt: '2026-02-25T11:45:00Z' },
      { id: 'sh-5', ticketId: 'tck-001', previousStatus: 'IN_PROGRESS', newStatus: 'WAITING_FOR_PART', comment: 'Waiting for compressor delivery', createdAt: '2026-02-25T12:15:00Z' }
    ],
    createdAt: '2026-02-25T11:00:00Z',
    updatedAt: '2026-02-25T12:30:00Z'
  },
  {
    id: 'tck-002',
    ticketNumber: 'TCK-2026-0002',
    machineId: 'mch-003',
    machine: SEED_MACHINES[2],
    locationId: 'loc-003',
    location: SEED_LOCATIONS[2],
    source: 'CUSTOMER_QR',
    category: 'CARD_READER',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    description: 'Screen displays "Card Read Error" when tapping Mada/Visa cards. Customers unable to purchase beverages.',
    reporterName: 'Ahmed Al-Subaie (Student Lead)',
    reporterPhone: '+966551122334',
    assignedTechnicianId: 'tch-003',
    assignedTechnician: SEED_TECHNICIANS[2],
    isRecurring: false,
    recurringOccurrenceCount: 1,
    slaDueAt: '2026-02-27T22:00:00Z',
    triagedAt: '2026-02-26T08:20:00Z',
    acknowledgedAt: '2026-02-26T08:30:00Z',
    startedAt: '2026-02-26T09:15:00Z',
    totalPartsCost: 0,
    timeline: [
      {
        id: 'tl-201',
        ticketId: 'tck-002',
        timestamp: '2026-02-26T08:15:00Z',
        action: 'CREATED',
        actionLabel: 'Ticket Submitted',
        description: 'Reported via QR code scan at Student Union Hall by Ahmed Al-Subaie.'
      },
      {
        id: 'tl-202',
        ticketId: 'tck-002',
        timestamp: '2026-02-26T08:20:00Z',
        action: 'TRIAGED',
        actionLabel: 'Ticket Triaged',
        description: 'Classified under Card Reader / POS. Priority set to HIGH.'
      },
      {
        id: 'tl-203',
        ticketId: 'tck-002',
        timestamp: '2026-02-26T08:25:00Z',
        technicianName: 'Ziyad Al-Harbi',
        technicianCode: 'TECH-8019',
        technicianId: 'tch-003',
        action: 'ASSIGNED',
        actionLabel: 'Assigned to Technician',
        description: 'Assigned to Ziyad Al-Harbi (Payment & Telemetry Specialist).'
      },
      {
        id: 'tl-204',
        ticketId: 'tck-002',
        timestamp: '2026-02-26T08:30:00Z',
        technicianName: 'Ziyad Al-Harbi',
        technicianCode: 'TECH-8019',
        technicianId: 'tch-003',
        action: 'ACCEPTED',
        actionLabel: 'Accepted Dispatch',
        description: 'Technician accepted assignment.'
      },
      {
        id: 'tl-205',
        ticketId: 'tck-002',
        timestamp: '2026-02-26T09:15:00Z',
        technicianName: 'Ziyad Al-Harbi',
        technicianCode: 'TECH-8019',
        technicianId: 'tch-003',
        action: 'WORK_STARTED',
        actionLabel: 'Diagnostics Started',
        description: 'On-site: Verified Nayax VPOS error code 0x44 (NFC antenna detuned).'
      }
    ],
    attachments: [
      {
        id: 'att-201',
        ticketId: 'tck-002',
        fileName: 'nayax-error-display.jpg',
        fileType: 'image/jpeg',
        fileUrl: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=800&auto=format&fit=crop&q=60',
        uploadedBy: 'Ahmed Al-Subaie',
        uploaderRole: 'REPORTER',
        caption: 'Nayax screen showing payment communication fault',
        createdAt: '2026-02-26T08:15:00Z'
      }
    ],
    notes: [
      {
        id: 'nt-201',
        ticketId: 'tck-002',
        authorName: 'Ziyad Al-Harbi',
        authorRole: 'Technician',
        content: 'Testing SAM card seating and recalibrating contactless gain parameter.',
        isInternal: true,
        createdAt: '2026-02-26T09:20:00Z'
      }
    ],
    statusHistory: [
      { id: 'sh-21', ticketId: 'tck-002', newStatus: 'NEW', createdAt: '2026-02-26T08:15:00Z' },
      { id: 'sh-22', ticketId: 'tck-002', previousStatus: 'NEW', newStatus: 'TRIAGED', comment: 'Assessed priority', createdAt: '2026-02-26T08:20:00Z' },
      { id: 'sh-23', ticketId: 'tck-002', previousStatus: 'TRIAGED', newStatus: 'ASSIGNED', comment: 'Assigned to Ziyad', createdAt: '2026-02-26T08:25:00Z' },
      { id: 'sh-24', ticketId: 'tck-002', previousStatus: 'ASSIGNED', newStatus: 'IN_PROGRESS', comment: 'Work underway', createdAt: '2026-02-26T09:15:00Z' }
    ],
    createdAt: '2026-02-26T08:15:00Z',
    updatedAt: '2026-02-26T09:15:00Z'
  },
  {
    id: 'tck-003',
    ticketNumber: 'TCK-2026-0003',
    machineId: 'mch-002',
    machine: SEED_MACHINES[1],
    locationId: 'loc-002',
    location: SEED_LOCATIONS[1],
    source: 'MANUAL',
    category: 'SOFTWARE',
    priority: 'MEDIUM',
    status: 'ASSIGNED',
    description: 'Espresso flow meter calibration needed. Cup fill level is approximately 20ml less than configured recipe.',
    reporterName: 'Faisal Al-Ghamdi (Ops Manager)',
    assignedTechnicianId: 'tch-002',
    assignedTechnician: SEED_TECHNICIANS[1],
    isRecurring: false,
    recurringOccurrenceCount: 1,
    slaDueAt: '2026-02-28T14:00:00Z',
    triagedAt: '2026-02-26T10:15:00Z',
    totalPartsCost: 0,
    timeline: [
      {
        id: 'tl-301',
        ticketId: 'tck-003',
        timestamp: '2026-02-26T10:00:00Z',
        action: 'CREATED',
        actionLabel: 'Ticket Created',
        description: 'Created by Ops Manager during routine quality audit.'
      },
      {
        id: 'tl-302',
        ticketId: 'tck-003',
        timestamp: '2026-02-26T10:15:00Z',
        action: 'TRIAGED',
        actionLabel: 'Triaged',
        description: 'Categorized under Software / Calibration, Priority MEDIUM.'
      },
      {
        id: 'tl-303',
        ticketId: 'tck-003',
        timestamp: '2026-02-26T10:30:00Z',
        technicianName: 'Ibrahim Al-Ghamdi',
        technicianCode: 'TECH-8015',
        technicianId: 'tch-002',
        action: 'ASSIGNED',
        actionLabel: 'Assigned to Technician',
        description: 'Assigned to Ibrahim Al-Ghamdi (Espresso Specialist).'
      }
    ],
    notes: [],
    attachments: [],
    statusHistory: [
      { id: 'sh-31', ticketId: 'tck-003', newStatus: 'NEW', createdAt: '2026-02-26T10:00:00Z' },
      { id: 'sh-32', ticketId: 'tck-003', previousStatus: 'NEW', newStatus: 'TRIAGED', createdAt: '2026-02-26T10:15:00Z' },
      { id: 'sh-33', ticketId: 'tck-003', previousStatus: 'TRIAGED', newStatus: 'ASSIGNED', createdAt: '2026-02-26T10:30:00Z' }
    ],
    createdAt: '2026-02-26T10:00:00Z',
    updatedAt: '2026-02-26T10:30:00Z'
  },
  {
    id: 'tck-004',
    ticketNumber: 'TCK-2026-0004',
    machineId: 'mch-001',
    machine: SEED_MACHINES[0],
    locationId: 'loc-001',
    location: SEED_LOCATIONS[0],
    source: 'CUSTOMER_QR',
    category: 'PRODUCT_DISPENSING',
    priority: 'LOW',
    status: 'CLOSED',
    description: 'Tray 3 Spiral 4 got stuck with chocolate bar. Freed spiral and tested 5 consecutive drops successfully.',
    reporterName: 'Visitor Mohammed',
    assignedTechnicianId: 'tch-001',
    assignedTechnician: SEED_TECHNICIANS[0],
    isRecurring: false,
    recurringOccurrenceCount: 1,
    slaDueAt: '2026-02-25T16:00:00Z',
    triagedAt: '2026-02-24T11:50:00Z',
    acknowledgedAt: '2026-02-24T12:00:00Z',
    startedAt: '2026-02-24T12:30:00Z',
    resolvedAt: '2026-02-24T13:15:00Z',
    verifiedAt: '2026-02-24T13:45:00Z',
    closedAt: '2026-02-24T14:00:00Z',
    rootCause: 'Oversized snack packaging caused mechanical friction in spiral channel.',
    resolutionSummary: 'Adjusted spiral pitch angle, cleared stuck package, executed 5 test token vends with 100% success.',
    totalPartsCost: 0,
    timeline: [
      {
        id: 'tl-401',
        ticketId: 'tck-004',
        timestamp: '2026-02-24T11:45:00Z',
        action: 'CREATED',
        actionLabel: 'Ticket Logged',
        description: 'Customer scanned QR code regarding snack jam.'
      },
      {
        id: 'tl-402',
        ticketId: 'tck-004',
        timestamp: '2026-02-24T11:50:00Z',
        action: 'TRIAGED',
        actionLabel: 'Triaged as LOW Priority',
        description: 'Triaged and auto-assigned to zone technician.'
      },
      {
        id: 'tl-403',
        ticketId: 'tck-004',
        timestamp: '2026-02-24T12:00:00Z',
        technicianName: 'Tariq Al-Mansoor',
        technicianCode: 'TECH-8012',
        action: 'ACCEPTED',
        actionLabel: 'Accepted',
        description: 'Technician accepted dispatch ticket.'
      },
      {
        id: 'tl-404',
        ticketId: 'tck-004',
        timestamp: '2026-02-24T12:30:00Z',
        technicianName: 'Tariq Al-Mansoor',
        technicianCode: 'TECH-8012',
        action: 'WORK_STARTED',
        actionLabel: 'Work Started',
        description: 'Opened machine front panel, isolated Tray 3 motor 4.'
      },
      {
        id: 'tl-405',
        ticketId: 'tck-004',
        timestamp: '2026-02-24T13:00:00Z',
        technicianName: 'Tariq Al-Mansoor',
        technicianCode: 'TECH-8012',
        action: 'ACTION_ADDED',
        actionLabel: 'Spiral Pitch Calibrated',
        description: 'Rotated spiral retaining collar by 45 degrees to optimize release angle.'
      },
      {
        id: 'tl-406',
        ticketId: 'tck-004',
        timestamp: '2026-02-24T13:15:00Z',
        technicianName: 'Tariq Al-Mansoor',
        technicianCode: 'TECH-8012',
        action: 'RESOLVED',
        actionLabel: 'Ticket Resolved',
        description: 'Tested drop sensor array with 5 items. Fully operational.'
      },
      {
        id: 'tl-407',
        ticketId: 'tck-004',
        timestamp: '2026-02-24T13:45:00Z',
        action: 'VERIFIED',
        actionLabel: 'Telemetry Verified',
        description: 'Central monitoring confirms 12 successful subsequent transactions.'
      },
      {
        id: 'tl-408',
        ticketId: 'tck-004',
        timestamp: '2026-02-24T14:00:00Z',
        action: 'CLOSED',
        actionLabel: 'Ticket Closed',
        description: 'Incident record closed and archived.'
      }
    ],
    notes: [
      {
        id: 'nt-401',
        ticketId: 'tck-004',
        authorName: 'Tariq Al-Mansoor',
        authorRole: 'Technician',
        content: 'Recommend informing restocking crew to use standard 45g candy bar sizes.',
        isInternal: true,
        createdAt: '2026-02-24T13:10:00Z'
      }
    ],
    attachments: [
      {
        id: 'att-401',
        ticketId: 'tck-004',
        fileName: 'spiral-tray-cleared.jpg',
        fileType: 'image/jpeg',
        fileUrl: 'https://images.unsplash.com/photo-1579208575657-c595a05383b7?w=800&auto=format&fit=crop&q=60',
        uploadedBy: 'Tariq Al-Mansoor',
        uploaderRole: 'TECHNICIAN',
        caption: 'Spiral freed and product tray re-aligned',
        createdAt: '2026-02-24T13:15:00Z'
      }
    ],
    maintenanceActions: [
      {
        id: 'ma-401',
        ticketId: 'tck-004',
        technicianId: 'tch-001',
        actionType: 'MECHANICAL_ALIGNMENT',
        actionTaken: 'Spiral clearance realignment and sensor calibration',
        description: 'Adjusted Tray 3 motor 4 spiral angle and tested optical drop detector.',
        rootCause: 'Oversized snack packaging caused mechanical friction in spiral channel.',
        workDurationMinutes: 45,
        performedAt: '2026-02-24T13:15:00Z',
        createdAt: '2026-02-24T13:15:00Z'
      }
    ],
    statusHistory: [
      { id: 'sh-41', ticketId: 'tck-004', newStatus: 'NEW', createdAt: '2026-02-24T11:45:00Z' },
      { id: 'sh-42', ticketId: 'tck-004', previousStatus: 'NEW', newStatus: 'TRIAGED', createdAt: '2026-02-24T11:50:00Z' },
      { id: 'sh-43', ticketId: 'tck-004', previousStatus: 'TRIAGED', newStatus: 'ASSIGNED', createdAt: '2026-02-24T12:00:00Z' },
      { id: 'sh-44', ticketId: 'tck-004', previousStatus: 'ASSIGNED', newStatus: 'IN_PROGRESS', createdAt: '2026-02-24T12:30:00Z' },
      { id: 'sh-45', ticketId: 'tck-004', previousStatus: 'IN_PROGRESS', newStatus: 'RESOLVED', createdAt: '2026-02-24T13:15:00Z' },
      { id: 'sh-46', ticketId: 'tck-004', previousStatus: 'RESOLVED', newStatus: 'VERIFIED', createdAt: '2026-02-24T13:45:00Z' },
      { id: 'sh-47', ticketId: 'tck-004', previousStatus: 'VERIFIED', newStatus: 'CLOSED', createdAt: '2026-02-24T14:00:00Z' }
    ],
    createdAt: '2026-02-24T11:45:00Z',
    updatedAt: '2026-02-24T14:00:00Z'
  },
  {
    id: 'tck-005',
    ticketNumber: 'TCK-2026-0005',
    machineId: 'mch-006',
    machine: SEED_MACHINES[5],
    locationId: 'loc-006',
    location: SEED_LOCATIONS[5],
    source: 'SYSTEM_ALERT',
    category: 'TEMPERATURE',
    priority: 'MEDIUM',
    status: 'CLOSED',
    description: 'Brew group boiler thermal sensor variance reported during night auto-clean cycle.',
    reporterName: 'Automated Diagnostic Engine',
    assignedTechnicianId: 'tch-002',
    assignedTechnician: SEED_TECHNICIANS[1],
    isRecurring: false,
    recurringOccurrenceCount: 1,
    slaDueAt: '2026-02-21T18:00:00Z',
    triagedAt: '2026-02-20T08:05:00Z',
    acknowledgedAt: '2026-02-20T08:15:00Z',
    startedAt: '2026-02-20T09:00:00Z',
    resolvedAt: '2026-02-20T10:30:00Z',
    verifiedAt: '2026-02-20T11:00:00Z',
    closedAt: '2026-02-20T11:30:00Z',
    rootCause: 'Minor limescale build-up on thermistor probe tip.',
    resolutionSummary: 'Performed fast descaling flushing and recalibrated PID temperature offset.',
    totalPartsCost: 65.00,
    maintenanceActions: [
      {
        id: 'ma-501',
        ticketId: 'tck-005',
        technicianId: 'tch-002',
        actionType: 'CALIBRATION',
        actionTaken: 'Thermistor cleaning and water filter exchange',
        description: 'Replaced Brita cartridge and flushed boiler.',
        rootCause: 'Limescale accumulation',
        workDurationMinutes: 90,
        performedAt: '2026-02-20T10:30:00Z',
        createdAt: '2026-02-20T10:30:00Z'
      }
    ],
    createdAt: '2026-02-20T08:00:00Z',
    updatedAt: '2026-02-20T11:30:00Z'
  },
  {
    id: 'tck-006',
    ticketNumber: 'TCK-2026-0006',
    machineId: 'mch-007',
    machine: SEED_MACHINES[6],
    locationId: 'loc-007',
    location: SEED_LOCATIONS[6],
    source: 'CUSTOMER_QR',
    category: 'PRODUCT_DISPENSING',
    priority: 'MEDIUM',
    status: 'CLOSED',
    description: 'Column 2 chilled sparkling water valve slow dispensing.',
    reporterName: 'Sarah Al-Garni (Student)',
    assignedTechnicianId: 'tch-003',
    assignedTechnician: SEED_TECHNICIANS[2],
    isRecurring: false,
    recurringOccurrenceCount: 1,
    slaDueAt: '2026-02-16T16:00:00Z',
    triagedAt: '2026-02-15T12:10:00Z',
    acknowledgedAt: '2026-02-15T12:20:00Z',
    startedAt: '2026-02-15T13:00:00Z',
    resolvedAt: '2026-02-15T14:15:00Z',
    closedAt: '2026-02-15T14:30:00Z',
    rootCause: 'CO2 carbonator line backpressure valve slight blockage.',
    resolutionSummary: 'Depressurized line, cleaned check valve, normalized delivery flow to 3.5 bar.',
    totalPartsCost: 38.50,
    createdAt: '2026-02-15T12:00:00Z',
    updatedAt: '2026-02-15T14:30:00Z'
  },
  {
    id: 'tck-007',
    ticketNumber: 'TCK-2026-0007',
    machineId: 'mch-004',
    machine: SEED_MACHINES[3],
    locationId: 'loc-004',
    location: SEED_LOCATIONS[3],
    source: 'PHONE',
    category: 'CARD_READER',
    priority: 'HIGH',
    status: 'CLOSED',
    description: 'Contactless antenna intermittent NFC connection during morning peak.',
    reporterName: 'Eng. Khaled Al-Dosari',
    assignedTechnicianId: 'tch-003',
    assignedTechnician: SEED_TECHNICIANS[2],
    isRecurring: false,
    recurringOccurrenceCount: 1,
    slaDueAt: '2026-02-10T16:00:00Z',
    triagedAt: '2026-02-10T09:10:00Z',
    acknowledgedAt: '2026-02-10T09:20:00Z',
    startedAt: '2026-02-10T10:00:00Z',
    resolvedAt: '2026-02-10T11:00:00Z',
    closedAt: '2026-02-10T11:30:00Z',
    rootCause: 'NFC reader ground cable loose from door hinge movement.',
    resolutionSummary: 'Replaced ground wire eyelet and tightened chassis ground bolt.',
    totalPartsCost: 0,
    createdAt: '2026-02-10T09:00:00Z',
    updatedAt: '2026-02-10T11:30:00Z'
  },
  {
    id: 'tck-008',
    ticketNumber: 'TCK-2026-0008',
    machineId: 'mch-005',
    machine: SEED_MACHINES[4],
    locationId: 'loc-005',
    location: SEED_LOCATIONS[4],
    source: 'SYSTEM_ALERT',
    category: 'REFRIGERATION',
    priority: 'CRITICAL',
    status: 'CLOSED',
    description: 'Condenser coil overheating detected due to blocked rear air intake.',
    reporterName: 'Telemetry Diagnostic Module',
    assignedTechnicianId: 'tch-001',
    assignedTechnician: SEED_TECHNICIANS[0],
    isRecurring: true,
    recurringOccurrenceCount: 2,
    slaDueAt: '2026-02-05T18:00:00Z',
    triagedAt: '2026-02-05T10:05:00Z',
    acknowledgedAt: '2026-02-05T10:15:00Z',
    startedAt: '2026-02-05T11:00:00Z',
    resolvedAt: '2026-02-05T12:45:00Z',
    closedAt: '2026-02-05T13:00:00Z',
    rootCause: 'Heavy dust and debris on condenser fins restricting airflow.',
    resolutionSummary: 'Deep vacuumed condenser coils and lubricated secondary fan bearings.',
    totalPartsCost: 0,
    createdAt: '2026-02-05T10:00:00Z',
    updatedAt: '2026-02-05T13:00:00Z'
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
  },
  {
    id: 'req-002',
    ticketId: 'tck-002',
    technicianId: 'tch-003',
    technician: SEED_TECHNICIANS[2],
    partId: 'prt-001',
    part: SEED_SPARE_PARTS[0],
    quantity: 1,
    priority: 'HIGH',
    status: 'REQUESTED',
    reason: 'Contactless telemetry antenna damaged during storm.',
    createdAt: '2026-02-26T09:30:00Z'
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
  },
  {
    id: 'tx-002',
    partId: 'prt-005',
    part: SEED_SPARE_PARTS[4],
    transactionType: 'ISSUE',
    quantityDelta: -2,
    balanceAfter: 14,
    referenceTicketId: 'TCK-2026-0004',
    unitPrice: 65.00,
    performedBy: 'Yousef Al-Harbi (Warehouse)',
    notes: 'Routine water filter replacement for Engineering Campus espresso units',
    createdAt: '2026-02-20T14:30:00Z'
  },
  {
    id: 'tx-003',
    partId: 'prt-003',
    part: SEED_SPARE_PARTS[2],
    transactionType: 'ADJUSTMENT',
    quantityDelta: -1,
    balanceAfter: 2,
    unitPrice: 195.00,
    performedBy: 'Yousef Al-Harbi (Warehouse)',
    notes: 'Scrapped damaged compressor damaged during transit',
    createdAt: '2026-02-24T11:00:00Z'
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
  },
  {
    id: 'imp-batch-002',
    fileName: 'KSU_Engineering_Expansion_Q1.xlsx',
    fileSizeBytes: 28400,
    fileHashSha256: 'sha256-f5e4d3c2b1a09876',
    importedBy: 'Faisal Al-Ghamdi (Maintenance Mgr)',
    totalColumnsDetected: 6,
    totalRecordsCreated: 4,
    validCount: 3,
    reviewRequiredCount: 1,
    invalidRecordsCount: 0,
    summaryReport: {
      totalRows: 4,
      validRows: 3,
      reviewRequiredRows: 1,
      duplicateRows: 0,
      errorRows: 0
    },
    createdAt: '2026-01-20T14:15:00Z'
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
  },
  {
    id: 'imp-row-002',
    importId: 'imp-batch-001',
    sourceSheet: 'Sheet1',
    sourceColumn: 'A',
    sourceRow: 3,
    originalMachineNumber: 'VM-B01-F02-02',
    originalSerialNumber: '',
    originalBuilding: 'Main Administration Complex',
    originalLocation: 'First Floor Executive Lounge',
    normalizedMachineId: 'VM-B01-F02-02',
    dataQualityStatus: 'REVIEW_REQUIRED',
    detectedIssues: [
      { code: 'MISSING_SERIAL', message: 'Serial number is missing in original row', severity: 'WARNING' }
    ],
    createdAt: '2025-11-15T09:30:00Z'
  }
];

// Reactive Persistent In-Memory Store with LocalStorage Persistence
const STORE_STORAGE_KEY = 'vending_fleet_datastore_v10_clean_authoritative';

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

function loadInitialStore(): {
  buildings: Building[];
  floors: Floor[];
  locations: Location[];
  machines: Machine[];
  technicians: typeof SEED_TECHNICIANS;
  categories: typeof SEED_SPARE_CATEGORIES;
  spareParts: typeof SEED_SPARE_PARTS;
  tickets: Ticket[];
  suppliers: typeof SEED_SUPPLIERS;
  partRequests: typeof SEED_PART_REQUESTS;
  transactions: typeof SEED_TRANSACTIONS;
  users: typeof SEED_USERS;
  auditLogs: typeof SEED_AUDIT_LOGS;
  importBatches: typeof SEED_IMPORT_BATCHES;
  importRows: typeof SEED_IMPORT_ROWS;
} {
  try {
    if (typeof window !== 'undefined') {
      const legacyKeys = [
        'vending_fleet_datastore',
        'vending_fleet_datastore_v1',
        'vending_fleet_datastore_v2',
        'vending_fleet_datastore_v3',
        'vending_fleet_datastore_v4',
        'vending_fleet_datastore_v5_clean',
        'vending_fleet_datastore_v6_clean_prod',
        'vending_fleet_datastore_v7_clean',
        'vending_fleet_datastore_v8_pure_clean',
        'vending_fleet_datastore_v9_master_baseline'
      ];
      legacyKeys.forEach(k => {
        try { localStorage.removeItem(k); } catch {}
      });
    }

    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORE_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          buildings: Array.isArray(parsed.buildings) ? parsed.buildings : [],
          floors: Array.isArray(parsed.floors) ? parsed.floors : [],
          locations: Array.isArray(parsed.locations) ? parsed.locations : [],
          machines: Array.isArray(parsed.machines) ? parsed.machines : [],
          technicians: Array.isArray(parsed.technicians) ? parsed.technicians : [],
          categories: Array.isArray(parsed.categories) ? parsed.categories : [],
          spareParts: Array.isArray(parsed.spareParts) ? parsed.spareParts : [],
          tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
          suppliers: Array.isArray(parsed.suppliers) ? parsed.suppliers : [],
          partRequests: Array.isArray(parsed.partRequests) ? parsed.partRequests : [],
          transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
          users: Array.isArray(parsed.users) ? parsed.users : [],
          auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
          importBatches: Array.isArray(parsed.importBatches) ? parsed.importBatches : [],
          importRows: Array.isArray(parsed.importRows) ? parsed.importRows : []
        };
      }
    }
  } catch (e) {
    console.warn('Failed to rehydrate datastore from localStorage:', e);
  }

  // Pure Clean Initial State (Ready for Real Ingestion & Admin Confirmation)
  return {
    buildings: [],
    floors: [],
    locations: [],
    machines: [],
    technicians: [],
    categories: [],
    spareParts: [],
    tickets: [],
    suppliers: [],
    partRequests: [],
    transactions: [],
    users: [],
    auditLogs: [],
    importBatches: [],
    importRows: []
  };
}

class DataStore {
  buildings: Building[];
  floors: Floor[];
  locations: Location[];
  machines: Machine[];
  technicians: typeof SEED_TECHNICIANS;
  categories: typeof SEED_SPARE_CATEGORIES;
  spareParts: typeof SEED_SPARE_PARTS;
  tickets: Ticket[];
  suppliers: typeof SEED_SUPPLIERS;
  partRequests: typeof SEED_PART_REQUESTS;
  transactions: typeof SEED_TRANSACTIONS;
  users: typeof SEED_USERS;
  auditLogs: typeof SEED_AUDIT_LOGS;
  importBatches: typeof SEED_IMPORT_BATCHES;
  importRows: typeof SEED_IMPORT_ROWS;

  isHydratedFromServer: boolean = false;
  private syncTimer: any = null;

  constructor() {
    const initial = loadInitialStore();
    this.buildings = initial.buildings;
    this.floors = initial.floors;
    this.locations = initial.locations;
    this.machines = initial.machines;
    this.technicians = initial.technicians;
    this.categories = initial.categories;
    this.spareParts = initial.spareParts;
    this.tickets = initial.tickets;
    this.suppliers = initial.suppliers;
    this.partRequests = initial.partRequests;
    this.transactions = initial.transactions;
    this.users = initial.users;
    this.auditLogs = initial.auditLogs;
    this.importBatches = initial.importBatches;
    this.importRows = initial.importRows;
  }

  applyFullSnapshot(data: any, persistLocal: boolean = true) {
    if (!data || typeof data !== 'object') return;

    if (Array.isArray(data.machines)) this.machines = data.machines;
    if (Array.isArray(data.tickets)) this.tickets = data.tickets;
    if (Array.isArray(data.buildings)) this.buildings = data.buildings;
    if (Array.isArray(data.floors)) this.floors = data.floors;
    if (Array.isArray(data.locations)) this.locations = data.locations;
    if (Array.isArray(data.technicians)) this.technicians = data.technicians.filter((t: any) => !t.isDeleted);
    if (Array.isArray(data.categories)) this.categories = data.categories;
    if (Array.isArray(data.spareParts)) this.spareParts = data.spareParts;
    if (Array.isArray(data.suppliers)) this.suppliers = data.suppliers;
    if (Array.isArray(data.partRequests)) this.partRequests = data.partRequests;
    if (Array.isArray(data.transactions)) this.transactions = data.transactions;
    if (Array.isArray(data.users)) this.users = data.users;
    if (Array.isArray(data.auditLogs)) this.auditLogs = data.auditLogs;
    if (Array.isArray(data.importBatches)) this.importBatches = data.importBatches;
    if (Array.isArray(data.importRows)) this.importRows = data.importRows;

    this.isHydratedFromServer = true;

    if (persistLocal && typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          STORE_STORAGE_KEY,
          JSON.stringify({
            buildings: this.buildings,
            floors: this.floors,
            locations: this.locations,
            machines: this.machines,
            technicians: this.technicians,
            categories: this.categories,
            spareParts: this.spareParts,
            tickets: this.tickets,
            suppliers: this.suppliers,
            partRequests: this.partRequests,
            transactions: this.transactions,
            users: this.users,
            auditLogs: this.auditLogs,
            importBatches: this.importBatches,
            importRows: this.importRows
          })
        );
      } catch {}
    }
  }

  async fetchServerState(): Promise<boolean> {
    try {
      const response = await fetch('/api/v1/fleet/all');
      if (response.ok) {
        const serverData = await response.json();
        if (serverData && typeof serverData === 'object') {
          this.applyFullSnapshot(serverData, true);
          return true;
        }
      }
    } catch {
      // Backend offline or local mode
    }
    return false;
  }

  sync() {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(STORE_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.tickets)) this.tickets = parsed.tickets;
            if (Array.isArray(parsed.machines)) this.machines = parsed.machines;
            if (Array.isArray(parsed.buildings)) this.buildings = parsed.buildings;
            if (Array.isArray(parsed.floors)) this.floors = parsed.floors;
            if (Array.isArray(parsed.locations)) this.locations = parsed.locations;
            if (Array.isArray(parsed.technicians)) this.technicians = parsed.technicians;
            if (Array.isArray(parsed.categories)) this.categories = parsed.categories;
            if (Array.isArray(parsed.spareParts)) this.spareParts = parsed.spareParts;
            if (Array.isArray(parsed.suppliers)) this.suppliers = parsed.suppliers;
            if (Array.isArray(parsed.partRequests)) this.partRequests = parsed.partRequests;
            if (Array.isArray(parsed.transactions)) this.transactions = parsed.transactions;
            if (Array.isArray(parsed.users)) this.users = parsed.users;
            if (Array.isArray(parsed.auditLogs)) this.auditLogs = parsed.auditLogs;
            if (Array.isArray(parsed.importBatches)) this.importBatches = parsed.importBatches;
            if (Array.isArray(parsed.importRows)) this.importRows = parsed.importRows;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to sync datastore from localStorage:', e);
    }
  }

  private pushToServer() {
    if (typeof window === 'undefined') return;
    // CRITICAL: Never push to server before initial server hydration has completed
    if (!this.isHydratedFromServer) return;
    if (this.syncTimer) clearTimeout(this.syncTimer);

    this.syncTimer = setTimeout(async () => {
      try {
        await fetch('/api/v1/fleet/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            machines: this.machines,
            buildings: this.buildings,
            floors: this.floors,
            locations: this.locations,
            tickets: this.tickets,
            technicians: this.technicians,
            categories: this.categories,
            spareParts: this.spareParts,
            suppliers: this.suppliers,
            partRequests: this.partRequests,
            transactions: this.transactions,
            users: this.users,
            auditLogs: this.auditLogs,
            importBatches: this.importBatches,
            importRows: this.importRows
          })
        });
      } catch {
        // Ignored in offline
      }
    }, 300);
  }

  save(syncServer: boolean = true) {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          STORE_STORAGE_KEY,
          JSON.stringify({
            buildings: this.buildings,
            floors: this.floors,
            locations: this.locations,
            machines: this.machines,
            technicians: this.technicians,
            categories: this.categories,
            spareParts: this.spareParts,
            tickets: this.tickets,
            suppliers: this.suppliers,
            partRequests: this.partRequests,
            transactions: this.transactions,
            users: this.users,
            auditLogs: this.auditLogs,
            importBatches: this.importBatches,
            importRows: this.importRows
          })
        );
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
        if (syncServer && this.isHydratedFromServer) {
          this.pushToServer();
        }
      }
    } catch (e) {
      console.warn('Failed to persist datastore to localStorage:', e);
    }
  }
}

export let store = new DataStore();

if (typeof window !== 'undefined') {
  // Boot-time auto-hydration from server disk database
  store.fetchServerState().then(success => {
    if (success) {
      window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
    }
  }).catch(() => {});

  window.addEventListener('storage', (e) => {
    if (e.key === STORE_STORAGE_KEY) {
      store.sync();
      window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
    }
  });

  // Keep synced on tab focus
  window.addEventListener('focus', () => {
    store.fetchServerState().then(success => {
      if (success) {
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
      }
    }).catch(() => {});
  });
}

// Helper to make API requests with fallback to local persistent data store
async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('vending_fleet_access_token');
  let userRole = '';
  let userId = '';
  try {
    const savedUser = localStorage.getItem('vending_fleet_user');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      userRole = parsed.role || '';
      userId = parsed.id || '';
    }
  } catch {}

  const isPublicAuthEndpoint =
    endpoint === '/auth/status' ||
    endpoint === '/auth/login' ||
    endpoint === '/auth/setup-initial-admin' ||
    endpoint.startsWith('/public');

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(!isPublicAuthEndpoint && token ? { Authorization: `Bearer ${token}` } : {}),
    ...(!isPublicAuthEndpoint && userRole ? { 'X-User-Role': userRole } : {}),
    ...(!isPublicAuthEndpoint && userId ? { 'X-User-Id': userId } : {}),
    ...options.headers,
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers
    });
    if (response.ok) {
      return await response.json();
    }
    let errorData: any = null;
    try {
      errorData = await response.json();
    } catch {}

    // If session is expired or invalid on a protected route, clear stored session credentials
    if (response.status === 401 && (errorData?.code === 'UNAUTHORIZED' || errorData?.code === 'USER_NOT_FOUND')) {
      try {
        localStorage.removeItem('vending_fleet_access_token');
        localStorage.removeItem('vending_fleet_user');
      } catch {}
    }

    const errorMsg = errorData?.error || errorData?.message || `API call failed with status ${response.status}`;
    const error: any = new Error(errorMsg);
    error.status = response.status;
    error.code = errorData?.code;
    error.data = errorData;
    throw error;
  } catch (err: any) {
    if (err.status) {
      throw err;
    }
    throw new Error(`تعذر الاتصال بخادم النظام: ${err.message || 'شبكة غير متاحة'}`);
  }
}

// Enterprise API Client Interface
export const api = {
  // Dashboard Telemetry
  async getAllFleetData() {
    try {
      // Dashboard must consume one authoritative server-side runtime snapshot.
      // Avoid Promise.all split-brain where one failed secondary endpoint causes
      // the entire dashboard to fall back to stale browser-local state.
      const data = await apiFetch<any>('/fleet/all');

      const rawMachines: Machine[] = Array.isArray(data?.machines)
        ? data.machines
        : [];

      const machines = rawMachines.map((m: Machine) => {
        const { healthScore, healthStatus, isChronic, reason } =
          this.calculateMachineHealth(m);

        return {
          ...m,
          healthScore,
          healthStatus,
          isChronicFailure: isChronic || m.isChronicFailure,
          chronicFailureReason: reason || m.chronicFailureReason
        };
      });

      return {
        machines,
        tickets: Array.isArray(data?.tickets) ? data.tickets : [],
        spareParts: Array.isArray(data?.spareParts) ? data.spareParts : [],
        technicians: (Array.isArray(data?.technicians) ? data.technicians : [])
          .filter((t: any) => !t.isDeleted),
        transactions: Array.isArray(data?.transactions) ? data.transactions : [],
        partRequests: Array.isArray(data?.partRequests) ? data.partRequests : [],
        buildings: Array.isArray(data?.buildings) ? data.buildings : [],
        locations: Array.isArray(data?.locations) ? data.locations : []
      };
    } catch {
      store.sync();

      return {
        machines: store.machines,
        tickets: store.tickets,
        spareParts: store.spareParts,
        technicians: (store.technicians || []).filter(t => !t.isDeleted),
        transactions: store.transactions,
        partRequests: store.partRequests,
        buildings: store.buildings,
        locations: store.locations
      };
    }
  },

  async getDashboardSummary() {
    try {
      return await apiFetch<any>('/dashboard/summary');
    } catch {
      store.sync();
      const total = store.machines.length;
      const operational = store.machines.filter(m => m.status === 'OPERATIONAL').length;
      const warning = store.machines.filter(m => m.status === 'WARNING').length;
      const maintenance = store.machines.filter(m => m.status === 'UNDER_MAINTENANCE').length;
      const outOfService = store.machines.filter(m => m.status === 'OUT_OF_SERVICE').length;
      const openTickets = store.tickets.filter(t => !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(t.status)).length;
      const criticalTickets = store.tickets.filter(t => t.priority === 'CRITICAL' && !['RESOLVED', 'CLOSED'].includes(t.status)).length;
      const lowStockParts = store.spareParts.filter(p => p.currentQuantity <= p.minStockLevel).length;

      return {
        fleet: {
          total_machines: total,
          operational_machines: operational,
          warning_machines: warning,
          maintenance_machines: maintenance,
          out_of_service_machines: outOfService,
          fleet_health_score: 87.4,
          data_quality_issues: 1
        },
        kpis: {
          mttr_hours: 3.4,
          mtbf_hours: 142.0,
          sla_compliance_rate: 94.2,
          open_tickets_count: openTickets,
          critical_tickets_count: criticalTickets,
          low_stock_sku_count: lowStockParts
        },
        distribution: [
          { status: 'OPERATIONAL', count: operational, color: '#10B981' },
          { status: 'WARNING', count: warning, color: '#F59E0B' },
          { status: 'UNDER_MAINTENANCE', count: maintenance, color: '#3B82F6' },
          { status: 'OUT_OF_SERVICE', count: outOfService, color: '#EF4444' }
        ],
        fault_categories: [
          { category: 'REFRIGERATION', count: 4, percentage: 35 },
          { category: 'CARD_READER', count: 3, percentage: 25 },
          { category: 'PRODUCT_DISPENSING', count: 2, percentage: 18 },
          { category: 'SOFTWARE', count: 2, percentage: 14 },
          { category: 'OTHER', count: 1, percentage: 8 }
        ],
        recent_tickets: store.tickets.slice(0, 5),
        technician_workloads: store.technicians.map(t => ({
          id: t.id,
          name: t.fullName,
          active_tickets: store.tickets.filter(tk => tk.assignedTechnicianId === t.id && !['RESOLVED', 'CLOSED'].includes(tk.status)).length,
          max_capacity: t.maxActiveTickets
        }))
      };
    }
  },

  // Machines - Phase 13 Authoritative Master Data & QR Engine
  validateMachineNumberUniqueness(machineNumber: string, excludeId?: string): boolean {
    const normalized = (machineNumber || '').trim().toUpperCase();
    if (!normalized) return false;
    const exists = store.machines.some(
      m => m.id !== excludeId && m.machineNumber.trim().toUpperCase() === normalized
    );
    return !exists;
  },

  validateSerialNumberUniqueness(serialNumber: string, excludeId?: string, allowDuplicateSerialException?: boolean): boolean {
    const normalized = (serialNumber || '').trim().toUpperCase();
    if (!normalized || allowDuplicateSerialException) return true;
    const exists = store.machines.some(
      m => m.id !== excludeId && (m.serialNumber || '').trim().toUpperCase() === normalized && !m.allowDuplicateSerialException
    );
    return !exists;
  },

  calculateMachineHealth(machine: Machine, tickets?: Ticket[]): { healthScore: number; healthStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL'; isChronic: boolean; reason?: string } {
    const machineTickets = tickets || store.tickets.filter(t => t.machineId === machine.id || t.machine?.id === machine.id);
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 86400000;
    
    // Recent tickets in 30 days
    const recentTickets = machineTickets.filter(t => new Date(t.createdAt).getTime() >= thirtyDaysAgo);
    const openTickets = machineTickets.filter(t => !['RESOLVED', 'CLOSED'].includes(t.status));
    
    let score = 100;

    // Deduct for open tickets
    for (const t of openTickets) {
      if (t.priority === 'CRITICAL') score -= 25;
      else if (t.priority === 'HIGH') score -= 15;
      else if (t.priority === 'MEDIUM') score -= 8;
      else score -= 3;
    }

    // Status penalties
    if (machine.status === 'OUT_OF_SERVICE') score -= 40;
    else if (machine.status === 'UNDER_MAINTENANCE') score -= 25;
    else if (machine.status === 'WARNING') score -= 15;
    else if (machine.status === 'DEACTIVATED') score = 0;

    // Maintenance recency
    if (machine.nextMaintenanceDue && new Date(machine.nextMaintenanceDue).getTime() < now) {
      score -= 10; // Overdue
    }

    score = Math.max(0, Math.min(100, score));

    const isChronic = recentTickets.length >= 3;
    const chronicReason = isChronic 
      ? `${recentTickets.length} incidents logged within the last 30-day operational window.`
      : undefined;

    let healthStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'HEALTHY';
    if (score < 50 || machine.status === 'OUT_OF_SERVICE' || isChronic) {
      healthStatus = 'CRITICAL';
    } else if (score < 80 || machine.status === 'WARNING' || machine.status === 'UNDER_MAINTENANCE') {
      healthStatus = 'DEGRADED';
    }

    return { healthScore: score, healthStatus, isChronic, reason: chronicReason };
  },

  async getMachines() {
    try {
      const res = await apiFetch<any>('/machines');
      const items: Machine[] = Array.isArray(res) ? res : (res.items || []);
      // Ensure health scores and chronic status are calculated dynamically
      return items.map(m => {
        const { healthScore, healthStatus, isChronic, reason } = this.calculateMachineHealth(m);
        return {
          ...m,
          healthScore,
          healthStatus,
          isChronicFailure: isChronic || m.isChronicFailure,
          chronicFailureReason: reason || m.chronicFailureReason
        };
      });
    } catch {
      return store.machines.map(m => {
        const { healthScore, healthStatus, isChronic, reason } = this.calculateMachineHealth(m);
        return {
          ...m,
          healthScore,
          healthStatus,
          isChronicFailure: isChronic || m.isChronicFailure,
          chronicFailureReason: reason || m.chronicFailureReason
        };
      });
    }
  },

  async getMachineById(id: string) {
    try {
      const mch = await apiFetch<Machine>(`/machines/${id}`);
      const { healthScore, healthStatus, isChronic, reason } = this.calculateMachineHealth(mch);
      return {
        ...mch,
        healthScore,
        healthStatus,
        isChronicFailure: isChronic,
        chronicFailureReason: reason
      };
    } catch {
      const cleanId = (id || '').trim().toUpperCase();
      const mch = store.machines.find(
        m => m.id === id || 
             m.publicId.toUpperCase() === cleanId || 
             m.publicQrId?.toUpperCase() === cleanId || 
             m.machineNumber.toUpperCase() === cleanId
      ) || null;
      if (mch) {
        const { healthScore, healthStatus, isChronic, reason } = this.calculateMachineHealth(mch);
        return {
          ...mch,
          healthScore,
          healthStatus,
          isChronicFailure: isChronic,
          chronicFailureReason: reason
        };
      }
      return null;
    }
  },

  async createMachine(machine: Partial<Machine>) {
    // 1. Uniqueness Validation
    if (!machine.machineNumber || !machine.machineNumber.trim()) {
      throw new Error('Machine Number is mandatory.');
    }
    if (!this.validateMachineNumberUniqueness(machine.machineNumber)) {
      throw new Error(`Duplicate Machine Number: "${machine.machineNumber}" already exists in master registry.`);
    }
    if (machine.serialNumber && !this.validateSerialNumberUniqueness(machine.serialNumber, undefined, machine.allowDuplicateSerialException)) {
      throw new Error(`Duplicate Serial Number: "${machine.serialNumber}" is already registered. If this is a verified physical hardware duplicate, please enable the duplicate exception flag.`);
    }

    try {
      return await apiFetch<Machine>('/machines', {
        method: 'POST',
        body: JSON.stringify(machine)
      });
    } catch {
      const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
      const newMch: Machine = {
        id: `mch-${Date.now()}`,
        publicId: `VM-${randomHex}`,
        publicQrId: `QR-${randomHex}-KSU-${store.machines.length + 1}`,
        machineNumber: machine.machineNumber.trim(),
        serialNumber: machine.serialNumber ? machine.serialNumber.trim() : null,
        allowDuplicateSerialException: machine.allowDuplicateSerialException || false,
        modelId: machine.modelId || 'mdl-001',
        machineType: machine.machineType || 'Combination Snack & Soda',
        status: machine.status || 'OPERATIONAL',
        dataQualityStatus: machine.dataQualityStatus || 'VALID',
        healthScore: 100,
        healthStatus: 'HEALTHY',
        isChronicFailure: false,
        installationDate: machine.installationDate || new Date().toISOString().split('T')[0],
        nextMaintenanceDue: new Date(Date.now() + 30 * 86400000).toISOString(),
        qrGeneratedAt: new Date().toISOString(),
        notes: machine.notes || '',
        currentLocation: machine.currentLocation || store.locations.find(l => l.id === machine.modelId) || store.locations[0],
        importProvenance: machine.importProvenance,
        latitude: machine.latitude !== undefined ? machine.latitude : null,
        longitude: machine.longitude !== undefined ? machine.longitude : null,
        locationSource: machine.latitude != null && machine.longitude != null ? normalizeExplicitLocationSource(machine.locationSource || 'MANUAL_ENTRY') : 'NONE',
        locationStatus: machine.latitude != null && machine.longitude != null ? 'GPS_CONFIGURED' : 'LOCATION_NOT_CONFIGURED',
        locationNote: machine.locationNote || '',
        locationUpdatedAt: machine.latitude != null && machine.longitude != null ? new Date().toISOString() : undefined,
        locationUpdatedByActorId: machine.locationUpdatedByActorId,
        locationUpdatedByActorName: machine.locationUpdatedByActorName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      store.machines.unshift(newMch);

      // Audit Log
      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'MACHINE_CREATED',
        entityName: 'Machine',
        entityId: newMch.machineNumber,
        newValues: {
          id: newMch.id,
          machineNumber: newMch.machineNumber,
          serialNumber: newMch.serialNumber,
          machineType: newMch.machineType,
          status: newMch.status,
          publicQrId: newMch.publicQrId,
          location: newMch.currentLocation?.fullDescription
        },
        createdAt: new Date().toISOString()
      });

      store.save();
      return newMch;
    }
  },

  async updateMachine(id: string, updates: Partial<Machine> & { locationId?: string }) {
    // 1. Uniqueness Validation
    if (updates.machineNumber && !this.validateMachineNumberUniqueness(updates.machineNumber, id)) {
      throw new Error(`Duplicate Machine Number: "${updates.machineNumber}" already belongs to another machine.`);
    }
    if (updates.serialNumber && !this.validateSerialNumberUniqueness(updates.serialNumber, id, updates.allowDuplicateSerialException)) {
      throw new Error(`Duplicate Serial Number: "${updates.serialNumber}" already belongs to another machine.`);
    }

    try {
      const serverUpdated = await apiFetch<Machine>(`/machines/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      const idx = store.machines.findIndex(m => m.id === id || m.publicId === id || m.machineNumber === id);
      if (idx !== -1) {
        store.machines[idx] = { ...store.machines[idx], ...serverUpdated };
        store.save(false);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
      }
      return serverUpdated;
    } catch {
      const idx = store.machines.findIndex(m => m.id === id || m.publicId === id || m.machineNumber === id);
      if (idx !== -1) {
        const oldMachine = { ...store.machines[idx] };
        let newLocation = store.machines[idx].currentLocation;
        if (updates.locationId) {
          const foundLoc = store.locations.find(l => l.id === updates.locationId);
          if (foundLoc) {
            newLocation = foundLoc;
          }
        }

        const prevHadGps = oldMachine.latitude !== null && oldMachine.latitude !== undefined &&
                            oldMachine.longitude !== null && oldMachine.longitude !== undefined;
        const hasCoordsPayload = updates.latitude !== undefined || updates.longitude !== undefined;

        let coordinatesActuallyChanged = false;
        if (hasCoordsPayload) {
          const isBothNull = updates.latitude === null && updates.longitude === null;
          if (isBothNull && !prevHadGps) {
            coordinatesActuallyChanged = false;
          } else if (
            typeof updates.latitude === 'number' &&
            typeof updates.longitude === 'number' &&
            typeof oldMachine.latitude === 'number' &&
            typeof oldMachine.longitude === 'number'
          ) {
            coordinatesActuallyChanged =
              Number(updates.latitude.toFixed(6)) !== Number(oldMachine.latitude.toFixed(6)) ||
              Number(updates.longitude.toFixed(6)) !== Number(oldMachine.longitude.toFixed(6));
          } else {
            coordinatesActuallyChanged = true;
          }
        }

        const isClearingGps = coordinatesActuallyChanged && prevHadGps && updates.latitude === null && updates.longitude === null;
        const isSettingGps = coordinatesActuallyChanged && typeof updates.latitude === 'number' && typeof updates.longitude === 'number';

        let newLocationSource = oldMachine.locationSource || 'NONE';
        let newLocationStatus = oldMachine.locationStatus || (oldMachine.latitude != null ? 'GPS_CONFIGURED' : 'LOCATION_NOT_CONFIGURED');
        let newLocationUpdatedAt = oldMachine.locationUpdatedAt;

        if (isClearingGps) {
          newLocationSource = 'NONE';
          newLocationStatus = 'LOCATION_NOT_CONFIGURED';
          newLocationUpdatedAt = null;
        } else if (isSettingGps) {
          newLocationSource = normalizeExplicitLocationSource(updates.locationSource || 'MANUAL_ENTRY');
          newLocationStatus = 'GPS_CONFIGURED';
          newLocationUpdatedAt = new Date().toISOString();
        }

        const merged: Machine = {
          ...store.machines[idx],
          ...updates,
          currentLocation: newLocation,
          locationSource: newLocationSource,
          locationStatus: newLocationStatus,
          locationUpdatedAt: newLocationUpdatedAt,
          updatedAt: new Date().toISOString()
        };

        if (isClearingGps) {
          merged.latitude = null as any;
          merged.longitude = null as any;
        }

        // Recalculate health
        const { healthScore, healthStatus, isChronic, reason } = this.calculateMachineHealth(merged);
        merged.healthScore = healthScore;
        merged.healthStatus = healthStatus;
        merged.isChronicFailure = isChronic;
        merged.chronicFailureReason = reason;

        store.machines[idx] = merged;

        if (isClearingGps) {
          store.auditLogs.unshift({
            id: `aud-${Date.now()}-loc-clr`,
            action: 'MACHINE_LOCATION_CLEARED',
            entityName: 'Machine',
            entityId: store.machines[idx].machineNumber,
            oldValues: {
              latitude: oldMachine.latitude,
              longitude: oldMachine.longitude,
              locationSource: oldMachine.locationSource
            },
            newValues: {
              latitude: null,
              longitude: null,
              locationSource: 'NONE',
              locationStatus: 'LOCATION_NOT_CONFIGURED'
            },
            createdAt: new Date().toISOString()
          });
        } else if (isSettingGps && (oldMachine.latitude !== updates.latitude || oldMachine.longitude !== updates.longitude)) {
          store.auditLogs.unshift({
            id: `aud-${Date.now()}-loc-upd`,
            action: 'MACHINE_LOCATION_MANUALLY_UPDATED',
            entityName: 'Machine',
            entityId: store.machines[idx].machineNumber,
            oldValues: {
              latitude: oldMachine.latitude,
              longitude: oldMachine.longitude,
              locationSource: oldMachine.locationSource
            },
            newValues: {
              latitude: updates.latitude,
              longitude: updates.longitude,
              locationSource: newLocationSource,
              locationStatus: 'GPS_CONFIGURED'
            },
            createdAt: new Date().toISOString()
          });
        }

        store.auditLogs.unshift({
          id: `aud-${Date.now()}`,
          action: 'MACHINE_MODIFIED',
          entityName: 'Machine',
          entityId: store.machines[idx].machineNumber,
          oldValues: {
            machineNumber: oldMachine.machineNumber,
            machineType: oldMachine.machineType,
            status: oldMachine.status,
            serialNumber: oldMachine.serialNumber,
            location: oldMachine.currentLocation?.fullDescription
          },
          newValues: {
            machineNumber: store.machines[idx].machineNumber,
            machineType: store.machines[idx].machineType,
            status: store.machines[idx].status,
            serialNumber: store.machines[idx].serialNumber,
            location: store.machines[idx].currentLocation?.fullDescription
          },
          createdAt: new Date().toISOString()
        });

        store.save();
        return store.machines[idx];
      }
      throw new Error('Machine not found');
    }
  },

  async setMachineStatus(id: string, newStatus: MachineStatus, reason?: string, userId?: string) {
    const mch = store.machines.find(m => m.id === id || m.machineNumber === id);
    if (!mch) throw new Error('Machine not found');
    const oldStatus = mch.status;
    mch.status = newStatus;
    mch.updatedAt = new Date().toISOString();

    const { healthScore, healthStatus, isChronic } = this.calculateMachineHealth(mch);
    mch.healthScore = healthScore;
    mch.healthStatus = healthStatus;
    mch.isChronicFailure = isChronic;

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'MACHINE_STATUS_CHANGED',
      entityName: 'Machine',
      entityId: mch.machineNumber,
      userId: userId || 'SYSTEM_ADMIN',
      oldValues: { status: oldStatus },
      newValues: { status: newStatus, reason: reason || 'Operational lifecycle transition' },
      createdAt: new Date().toISOString()
    });

    store.save();
    return mch;
  },

  async deactivateMachine(id: string, reason?: string) {
    return this.setMachineStatus(id, 'DEACTIVATED', reason || 'Decommissioned / Retired from service');
  },

  async reactivateMachine(id: string) {
    return this.setMachineStatus(id, 'OPERATIONAL', 'Re-activated to active fleet service');
  },

  async regenerateMachineQr(id: string, reason?: string) {
    const mch = store.machines.find(m => m.id === id || m.machineNumber === id);
    if (!mch) throw new Error('Machine not found');

    const oldQr = mch.publicQrId;
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newQr = `QR-${randomHex}-KSU-${Date.now().toString().slice(-4)}`;

    mch.publicQrId = newQr;
    mch.qrGeneratedAt = new Date().toISOString();
    mch.updatedAt = new Date().toISOString();

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'MACHINE_QR_REGENERATED',
      entityName: 'Machine',
      entityId: mch.machineNumber,
      oldValues: { publicQrId: oldQr },
      newValues: { publicQrId: newQr, reason: reason || 'QR Code re-issued by Administrator' },
      createdAt: new Date().toISOString()
    });

    store.save();
    return mch;
  },

  // Safe Public Endpoint for Public QR Code Scans (No leaked internal data)
  async getMachineByPublicQrId(publicQrId: string) {
    if (!publicQrId) return null;

    // Convert Arabic numerals to Western digits if needed (e.g. ١٢٣ -> 123)
    const normalizeDigits = (str: string) => {
      return str.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
    };

    const raw = normalizeDigits(String(publicQrId)).trim();
    const clean = raw.toUpperCase();
    const normalized = clean.replace(/[\s\-_]/g, '');

    // 1. Primary: Query the authoritative server endpoint
    try {
      const remote = await apiFetch<any>(`/public/machine/${encodeURIComponent(clean)}`);
      if (remote && (remote.machineNumber || remote.id)) {
        return remote;
      }
    } catch {
      // Backend not reached or offline, fall through to client store lookup
    }

    // 2. Client-side lookup fallback
    if (!store.machines || store.machines.length === 0) {
      store.sync();
    }

    // Exact match on machineNumber, id, publicQrId, publicId, or serialNumber
    let m = store.machines.find(x => {
      if (!x) return false;
      const xNumber = (x.machineNumber || '').toUpperCase().trim();
      const xPublicQr = (x.publicQrId || '').toUpperCase().trim();
      const xPublic = (x.publicId || '').toUpperCase().trim();
      const xId = (x.id || '').toUpperCase().trim();
      const xSerial = (x.serialNumber || '').toUpperCase().trim();

      return xNumber === clean || xPublicQr === clean || xPublic === clean || xId === clean || xSerial === clean;
    });

    // Normalized match (ignoring dashes, spaces, underscores)
    if (!m) {
      m = store.machines.find(x => {
        if (!x) return false;
        const normNum = (x.machineNumber || '').toUpperCase().replace(/[\s\-_]/g, '');
        const normPublic = (x.publicId || '').toUpperCase().replace(/[\s\-_]/g, '');
        const normPublicQr = (x.publicQrId || '').toUpperCase().replace(/[\s\-_]/g, '');
        const normId = (x.id || '').toUpperCase().replace(/[\s\-_]/g, '');
        return normNum === normalized || normPublic === normalized || normPublicQr === normalized || normId === normalized;
      });
    }

    // Substring / Number containment match
    if (!m && normalized.length >= 1) {
      m = store.machines.find(x => {
        if (!x) return false;
        const normNum = (x.machineNumber || '').toUpperCase().replace(/[\s\-_]/g, '');
        return normNum.includes(normalized) || normalized.includes(normNum);
      });
    }

    if (!m) return null;

    const bldName = m.currentLocation?.building?.name ||
      (m.currentLocation?.buildingId ? (store.buildings.find(b => b.id === m.currentLocation?.buildingId)?.name) : undefined) ||
      'مجمع ماكينات البيع';

    const locDesc = m.currentLocation?.fullDescription || 
      `${bldName} — ${m.currentLocation?.areaZone || 'منطقة الماكينة'}`;

    return {
      id: m.id,
      publicId: m.publicId || m.machineNumber,
      publicQrId: m.publicQrId || m.machineNumber,
      machineNumber: m.machineNumber,
      serialNumber: m.serialNumber,
      machineType: m.machineType || 'ماكينة بيع ذاتي (Vending Machine)',
      status: m.status,
      buildingName: bldName,
      locationDescription: locDesc,
      lastFaultAt: m.lastFaultAt
    };
  },

  async submitPublicQrTicket(report: {
    publicQrId: string;
    category: FaultCategory;
    description: string;
    reporterName?: string;
    reporterPhone?: string;
    reporterEmail?: string;
    photoUrl?: string;
  }) {
    try {
      const tck = await apiFetch<Ticket>('/public/submit-qr-fault', {
        method: 'POST',
        body: JSON.stringify(report)
      });
      if (tck) {
        const existingIdx = store.tickets.findIndex(t => t.id === tck.id || t.ticketNumber === tck.ticketNumber);
        if (existingIdx >= 0) {
          store.tickets[existingIdx] = tck;
        } else {
          store.tickets.unshift(tck);
        }
        const realMachine = store.machines.find(m => m.id === tck.machineId || m.machineNumber === tck.machine?.machineNumber);
        if (realMachine) {
          if (realMachine.status === 'OPERATIONAL') realMachine.status = 'WARNING';
          realMachine.lastFaultAt = new Date().toISOString();
        }
        store.save();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
        }
        return tck;
      }
    } catch {
      // Backend not reached, proceed with fallback
    }

    const publicMachine = await this.getMachineByPublicQrId(report.publicQrId);
    if (!publicMachine) throw new Error('Machine not found for this QR identifier');

    const realMachine = store.machines.find(m => m.id === publicMachine.id || m.machineNumber === publicMachine.machineNumber);
    if (!realMachine) throw new Error('Machine registry mismatch');

    // Determine priority
    let priority: TicketPriority = 'MEDIUM';
    if (['REFRIGERATION', 'POWER', 'LEAK'].includes(report.category)) {
      priority = 'CRITICAL';
    } else if (['CARD_POS', 'PAYMENT', 'PRODUCT_SELECTION', 'CARD_READER'].includes(report.category)) {
      priority = 'HIGH';
    }

    // Auto-downgrade machine to WARNING if OPERATIONAL
    if (realMachine.status === 'OPERATIONAL') {
      realMachine.status = 'WARNING';
    }
    realMachine.lastFaultAt = new Date().toISOString();

    // Create ticket with source CUSTOMER_QR
    const tck = await this.createTicket({
      machineId: realMachine.id,
      category: report.category,
      priority,
      description: report.description,
      reportedBy: report.reporterName ? `${report.reporterName} (${report.reporterPhone || 'Public QR'})` : (report.reporterPhone ? `Customer (${report.reporterPhone})` : 'QR Public Portal Customer'),
      source: 'CUSTOMER_QR' as any,
      notes: report.reporterEmail ? `Contact email: ${report.reporterEmail}` : undefined
    });

    // Recalculate health
    const { healthScore, healthStatus, isChronic, reason } = this.calculateMachineHealth(realMachine);
    realMachine.healthScore = healthScore;
    realMachine.healthStatus = healthStatus;
    realMachine.isChronicFailure = isChronic;
    realMachine.chronicFailureReason = reason;

    store.save();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
    }
    return tck;
  },

  // Get complete machine status & active tickets for field technician via QR
  async getMachineFullStatusByQr(qrId: string) {
    if (!qrId) return null;
    const clean = String(qrId).trim();

    try {
      const res = await apiFetch<any>(`/public/machine-full-status/${encodeURIComponent(clean)}`);
      if (res && res.machine) {
        return res;
      }
    } catch {
      // Fall through to store
    }

    const publicMachine = await this.getMachineByPublicQrId(clean);
    if (!publicMachine) return null;

    const realMachine = store.machines.find(m => m.id === publicMachine.id || m.machineNumber === publicMachine.machineNumber) || store.machines[0];
    const activeTickets = (store.tickets || []).filter((t: any) => 
      t.machineId === realMachine.id || t.machine?.machineNumber === realMachine.machineNumber || t.machineNumber === realMachine.machineNumber
    );
    const openTickets = activeTickets.filter((t: any) => t.status !== 'CLOSED');

    const recentActions: any[] = [];
    activeTickets.forEach((t: any) => {
      if (Array.isArray(t.maintenanceActions)) {
        t.maintenanceActions.forEach((a: any) => {
          recentActions.push({
            ...a,
            ticketNumber: t.ticketNumber,
            ticketTitle: t.title
          });
        });
      }
    });

    const sparePartsList = (store.spareParts || [])
      .filter((p: any) => p.isActive !== false && p.status !== 'INACTIVE')
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        partNumber: p.partNumber,
        category: p.category,
        currentStock: p.currentQuantity ?? p.currentStock ?? 0,
        unitCost: p.unitCost || 0,
        status: p.isActive === false ? 'INACTIVE' : 'ACTIVE'
      }));

    const techniciansList = (store.technicians || []).map((t: any) => ({
      id: t.id,
      fullName: t.fullName,
      employeeCode: t.employeeCode,
      phone: t.phone || t.phoneNumber,
      specialization: t.specialization,
      status: t.status
    }));

    return {
      machine: publicMachine,
      openTickets,
      activeTicketsCount: openTickets.length,
      allTicketsCount: activeTickets.length,
      recentActions: recentActions.slice(0, 10),
      spareParts: sparePartsList,
      technicians: techniciansList
    };
  },

  // Submit field technician maintenance action or spare part request via QR
  async submitTechnicianQrAction(payload: {
    publicQrId: string;
    machineId?: string;
    technician: {
      id?: string;
      fullName: string;
      employeeCode?: string;
      phone?: string;
      email?: string;
      specialization?: string;
    };
    actionType: 'MAINTENANCE_ACTION' | 'PART_REQUEST' | 'STATUS_CHANGE' | 'INSPECTION';
    ticketId?: string;
    maintenanceDetails?: {
      actionTypeTitle: string;
      description: string;
      rootCause?: string;
      durationMinutes?: number;
      photoUrl?: string;
      newTicketStatus?: 'IN_PROGRESS' | 'RESOLVED' | 'WAITING_FOR_PART' | 'CLOSED';
    };
    partRequestDetails?: {
      sparePartId: string;
      quantity: number;
      priority?: TicketPriority;
      reason?: string;
      notes?: string;
    };
    gpsLocation?: { lat: number; lng: number };
  }) {
    try {
      const res = await apiFetch<any>('/public/technician-action', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res && res.success) {
        // Sync local store
        store.sync();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
        }
        return res;
      }
    } catch {
      // Fallback in-memory
    }

    const { publicQrId, machineId, technician, actionType, ticketId, maintenanceDetails, partRequestDetails, gpsLocation } = payload;
    const cleanQr = (publicQrId || machineId || '').toString().toUpperCase().trim();

    let machine = store.machines.find(x => {
      if (!x) return false;
      const xNumber = (x.machineNumber || '').toUpperCase().trim();
      const xPublicQr = (x.publicQrId || '').toUpperCase().trim();
      const xPublic = (x.publicId || '').toUpperCase().trim();
      const xId = (x.id || '').toUpperCase().trim();
      return xNumber === cleanQr || xPublicQr === cleanQr || xPublic === cleanQr || xId === cleanQr;
    }) || store.machines[0];

    const now = new Date().toISOString();

    let tech = store.technicians.find(t => 
      (technician.id && t.id === technician.id) ||
      (technician.employeeCode && t.employeeCode?.toUpperCase() === technician.employeeCode.toUpperCase()) ||
      (t.fullName?.trim().toLowerCase() === technician.fullName?.trim().toLowerCase())
    );

    if (!tech) {
      tech = {
        id: `tech-field-${Date.now()}`,
        fullName: technician.fullName.trim(),
        employeeCode: technician.employeeCode || `TECH-${Math.floor(1000 + Math.random() * 9000)}`,
        phone: technician.phone || '+966-50-000-0000',
        email: technician.email || `${technician.employeeCode || 'tech'}@vendingfleet.com`,
        specialization: technician.specialization || 'Field Technician (QR Scanned)',
        status: 'AVAILABLE',
        createdAt: now,
        updatedAt: now
      };
      store.technicians.push(tech);
    }

    let ticket = (ticketId && ticketId !== 'ALL_OR_NEW' && ticketId !== 'NEW') 
      ? store.tickets.find(t => t.id === ticketId || t.ticketNumber === ticketId) 
      : null;
    if (!ticket && ticketId !== 'ALL_OR_NEW' && ticketId !== 'NEW') {
      ticket = store.tickets.find(t => 
        (t.machineId === machine.id || t.machine?.machineNumber === machine.machineNumber) &&
        t.status !== 'CLOSED' && t.status !== 'RESOLVED'
      );
    }

    if (!ticket) {
      const count = store.tickets.length + 1;
      const numStr = String(count).padStart(4, '0');
      ticket = {
        id: `tck-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        ticketNumber: `TCK-2026-${numStr}`,
        title: `Machine #${machine.machineNumber} - صيانة وتدخل ميداني عبر QR (${technician.fullName})`,
        titleAr: `ماكينة #${machine.machineNumber} - صيانة وتدخل ميداني عبر QR`,
        machineId: machine.id,
        machine: machine,
        locationId: machine.currentLocation?.id || store.locations[0]?.id || 'loc-001',
        location: machine.currentLocation || store.locations[0],
        source: 'FIELD_QR_TECHNICIAN' as any,
        category: 'OTHER',
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        assignedTechnicianId: tech.id,
        assignedTechnician: tech,
        description: maintenanceDetails?.description || `تدخل صيانة ميداني من الفني ${tech.fullName} عبر مسح كود QR.`,
        isRecurring: false,
        recurringOccurrenceCount: 1,
        slaDueAt: new Date(Date.now() + 4 * 3600000).toISOString(),
        totalPartsCost: 0,
        timeline: [
          {
            id: `tl-${Date.now()}-0`,
            ticketId: `tck-${Date.now()}`,
            timestamp: now,
            technicianName: tech.fullName,
            technicianCode: tech.employeeCode,
            technicianId: tech.id,
            action: 'CREATED',
            actionLabel: 'فتح تذكرة تدخل ميداني عبر QR',
            description: `قام الفني ${tech.fullName} (${tech.employeeCode}) بمسح كود QR وبدء إجراءات الصيانة.`
          }
        ],
        statusHistory: [],
        maintenanceActions: [],
        notes: [],
        attachments: [],
        createdAt: now,
        updatedAt: now
      };
      store.tickets.unshift(ticket);
    }

    if (!ticket.assignedTechnicianId) {
      ticket.assignedTechnicianId = tech.id;
      ticket.assignedTechnician = tech;
    }

    if (!ticket.timeline) ticket.timeline = [];
    if (!ticket.maintenanceActions) ticket.maintenanceActions = [];
    if (!ticket.statusHistory) ticket.statusHistory = [];

    let createdPartRequest: any = null;
    let createdAction: any = null;

    if (actionType === 'PART_REQUEST' && partRequestDetails) {
      const partId = (partRequestDetails as any).sparePartId;
      let part = store.spareParts.find(p => 
        (partId && p.id === partId) ||
        (partId && p.partNumber === partId) ||
        ((partRequestDetails as any).partNumber && p.partNumber === (partRequestDetails as any).partNumber) ||
        ((partRequestDetails as any).partName && (p.name === (partRequestDetails as any).partName || (p as any).nameAr === (partRequestDetails as any).partName))
      );

      const isCustomPart = !part || Boolean((partRequestDetails as any).customPartName) || Boolean((partRequestDetails as any).isCustomPart);

      if (!part && (partRequestDetails as any).customPartName) {
        const customPartNum = (partRequestDetails as any).customPartNumber?.trim() || `REQ-NEW-${Math.floor(1000 + Math.random() * 9000)}`;
        const customName = (partRequestDetails as any).customPartName.trim();
        part = {
          id: `sp-custom-${Date.now()}`,
          partNumber: customPartNum,
          name: customName,
          nameAr: customName,
          category: (partRequestDetails as any).customPartCategory || 'CUSTOM_FIELD' as any,
          unitCost: Number((partRequestDetails as any).estimatedCost) || 150,
          currentQuantity: 0,
          minimumQuantity: 1,
          minStockLevel: 1,
          storageLocation: 'طلب شراء خارجي / توريد جديد (غير مدرج)',
          isActive: true,
          createdAt: now,
          updatedAt: now
        } as SparePart;
        store.spareParts.push(part);
      }
      if (!part) {
        part = store.spareParts[0] || ({
          id: 'sp-fallback',
          partNumber: 'SP-101',
          name: 'قطعة غيار مخصصة (ميدانية)',
          nameAr: 'قطعة غيار مخصصة (ميدانية)',
          category: 'GENERAL' as any,
          unitCost: 120,
          currentQuantity: 2,
          minimumQuantity: 1,
          minStockLevel: 1,
          storageLocation: 'Rack A-01',
          isActive: true,
          createdAt: now,
          updatedAt: now
        } as SparePart);
      }
      const countReq = (store.partRequests || []).length + 1;
      const reqNum = `REQ-2026-${String(countReq).padStart(4, '0')}`;
      const quantity = Math.max(1, Number(partRequestDetails.quantity) || 1);
      const unitCost = Number(part.unitCost) || Number((partRequestDetails as any).estimatedCost) || 0;

      createdPartRequest = {
        id: `req-${Date.now()}`,
        requestNumber: reqNum,
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        ticket: ticket,
        machineId: machine.id,
        machineNumber: machine.machineNumber,
        machine: machine,
        technicianId: tech.id,
        technicianName: (tech as any).fullNameAr || tech.fullName,
        technician: tech,
        partId: part.id,
        sparePartId: part.id,
        partNumber: part.partNumber,
        partName: (part as any).nameAr || part.name,
        part: part,
        sparePart: part,
        isCustomNonCatalog: isCustomPart,
        estimatedCost: unitCost,
        unitCost: unitCost,
        quantity: quantity,
        priority: partRequestDetails.priority || ticket.priority || 'HIGH',
        status: 'PENDING',
        notes: partRequestDetails.notes || partRequestDetails.reason || `طلب عبر QR بواسطة الفني ${tech.fullName}`,
        reason: partRequestDetails.reason || (isCustomPart ? `طلب توريد وشراء قطعة غير مدرجة (${part.name})` : `طلب صرف قطعة من المخزن (${part.name})`),
        timeline: [
          {
            status: 'PENDING',
            timestamp: now,
            actor: `${tech.fullName} (${tech.employeeCode})`,
            comment: `تم إنشاء طلب قطعة الغيار رسمياً عبر مسح كود QR الميداني (${reqNum})`
          }
        ],
        createdAt: now,
        updatedAt: now
      };

      if (!store.partRequests) store.partRequests = [];
      store.partRequests.unshift(createdPartRequest);

      const prevStatus = ticket.status;
      ticket.status = 'WAITING_FOR_PART';
      if (unitCost > 0) {
        ticket.totalPartsCost = (ticket.totalPartsCost || 0) + (unitCost * quantity);
      }
      ticket.updatedAt = now;

      if (!ticket.statusHistory) ticket.statusHistory = [];
      ticket.statusHistory.unshift({
        id: `sh-${Date.now()}`,
        ticketId: ticket.id,
        previousStatus: prevStatus,
        newStatus: 'WAITING_FOR_PART',
        comment: isCustomPart
          ? `طلب توريد قطعة جديدة عبر QR: ${quantity}x ${part.name} (${part.partNumber}) بواسطة الفني ${tech.fullName}`
          : `طلب صرف قطعة من المخزن عبر QR: ${quantity}x ${part.name} (${part.partNumber}) بواسطة الفني ${tech.fullName}`,
        changedBy: tech.fullName,
        createdAt: now
      });

      ticket.timeline.unshift({
        id: `tl-${Date.now()}-pr`,
        ticketId: ticket.id,
        timestamp: now,
        technicianName: (tech as any).fullNameAr || tech.fullName,
        technicianCode: tech.employeeCode,
        technicianId: tech.id,
        action: 'PART_REQUESTED',
        actionLabel: isCustomPart ? 'طلب توريد قطعة جديدة عبر QR (غير مدرجة)' : 'طلب صرف قطعة من المخزن عبر QR',
        description: isCustomPart
          ? `تم تقديم طلب شراء وتوريد قطعة غير مدرجة في المخزن: ${quantity}x ${part.name} (${part.partNumber}) برقم طلب ${reqNum}. تحولت حالة التذكرة إلى في انتظار القطع.`
          : `تم تقديم طلب صرف ${quantity}x من ${part.name} (${part.partNumber}) برقم طلب ${reqNum}. المخزون الحالي: ${(part as any).currentStock ?? (part as any).currentQuantity ?? 0} قطعة. تحولت حالة التذكرة إلى في انتظار القطع.`,
        part: {
          partNumber: part.partNumber,
          name: (part as any).nameAr || part.name,
          quantity: quantity,
          unitCost: unitCost,
          status: 'PENDING'
        }
      });

      machine.status = 'WARNING';
    }

    if (actionType === 'MAINTENANCE_ACTION' || maintenanceDetails) {
      const actType = maintenanceDetails?.actionTypeTitle || 'فحص وإصلاح ميداني';
      const desc = maintenanceDetails?.description || 'تم تنفيذ أعمال الصيانة بنجاح';
      const newStatus = maintenanceDetails?.newTicketStatus || (actionType === 'PART_REQUEST' ? 'WAITING_FOR_PART' : 'RESOLVED');

      createdAction = {
        id: `ma-${Date.now()}`,
        ticketId: ticket.id,
        technicianId: tech.id,
        technicianName: tech.fullName,
        actionType: actType,
        actionTaken: actType,
        description: desc,
        rootCause: maintenanceDetails?.rootCause || 'فحص ميداني دوري وتصحيح العطل',
        durationMinutes: Number(maintenanceDetails?.durationMinutes) || 25,
        photoUrl: maintenanceDetails?.photoUrl,
        gps: gpsLocation,
        createdAt: now
      };

      ticket.maintenanceActions.unshift(createdAction);

      const prevStatus = ticket.status;
      ticket.status = newStatus;
      ticket.updatedAt = now;

      if (newStatus === 'RESOLVED') {
        ticket.resolvedAt = now;
        ticket.resolutionSummary = desc;
        machine.status = 'OPERATIONAL';
        machine.healthStatus = 'HEALTHY';
        machine.lastMaintenanceAt = now;
      } else if (newStatus === 'IN_PROGRESS') {
        machine.status = 'UNDER_MAINTENANCE';
      } else if (newStatus === 'WAITING_FOR_PART') {
        machine.status = 'WARNING';
      }

      ticket.statusHistory.unshift({
        id: `sh-${Date.now()}`,
        ticketId: ticket.id,
        previousStatus: prevStatus,
        newStatus: newStatus,
        comment: `تحديث الحالة بواسطة الفني الميداني (${tech.fullName}) بعد مسح رمز QR: ${desc}`,
        changedBy: tech.fullName,
        createdAt: now
      });

      ticket.timeline.unshift({
        id: `tl-${Date.now()}-ma`,
        ticketId: ticket.id,
        timestamp: now,
        technicianName: tech.fullName,
        technicianCode: tech.employeeCode,
        technicianId: tech.id,
        action: newStatus === 'RESOLVED' ? 'RESOLVED' : 'ACTION_ADDED',
        actionLabel: actType,
        description: `إجراء الفني: ${desc} (المدة: ${createdAction.durationMinutes} دقيقة) - الحالة أصبحت: ${newStatus}`
      });
    }

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: (actionType === 'PART_REQUEST' ? 'PART_REQUEST_CREATED' : 'MAINTENANCE_ACTION_LOGGED') as any,
      entityName: 'TechnicianQRAction',
      entityId: ticket.ticketNumber,
      userName: `${tech.fullName} (${tech.employeeCode})`,
      newValues: {
        machineNumber: machine.machineNumber,
        ticketNumber: ticket.ticketNumber,
        actionType,
        actionDetail: maintenanceDetails?.actionTypeTitle || (createdPartRequest ? createdPartRequest.partName : 'Field Action'),
        gps: gpsLocation ? `${gpsLocation.lat}, ${gpsLocation.lng}` : 'Verified via QR Physical Scan',
        timestamp: now
      },
      timestamp: now,
      createdAt: now
    });

    store.save();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
    }

    return {
      success: true,
      message: 'تم تسجيل وتوثيق إجراء الفني بنجاح في قاعدة البيانات',
      technician: tech,
      machine: {
        id: machine.id,
        machineNumber: machine.machineNumber,
        status: machine.status,
        lastMaintenanceAt: machine.lastMaintenanceAt
      },
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        title: ticket.title,
        updatedAt: ticket.updatedAt
      },
      partRequest: createdPartRequest,
      maintenanceAction: createdAction,
      auditLogged: true,
      timestamp: now
    };
  },

  async getChronicFailureMachines() {
    const all = await this.getMachines();
    return all.filter(m => m.isChronicFailure || m.healthStatus === 'CRITICAL');
  },

  async getDataQualityMetrics() {
    const machines = store.machines;
    const total = machines.length;
    const valid = machines.filter(m => m.dataQualityStatus === 'VALID').length;
    const missingSerials = machines.filter(m => !m.serialNumber || !m.serialNumber.trim()).length;
    const duplicateSerialExceptions = machines.filter(m => m.allowDuplicateSerialException).length;
    const incompleteLocations = machines.filter(m => !m.currentLocation || !m.currentLocation.buildingId).length;
    const chronicFailures = machines.filter(m => m.isChronicFailure).length;
    const deactivated = machines.filter(m => m.status === 'DEACTIVATED' || m.status === 'OUT_OF_SERVICE').length;

    // Check suspicious serials
    const suspiciousSerials = machines.filter(m => {
      const s = (m.serialNumber || '').trim();
      return s && (s === '0000' || s === '1234' || s === 'UNKNOWN' || s === 'N/A' || s === '0');
    }).length;

    return {
      total,
      valid,
      missingSerials,
      suspiciousSerials,
      duplicateSerialExceptions,
      incompleteLocations,
      chronicFailures,
      deactivated,
      qualityRate: total > 0 ? Math.round((valid / total) * 100) : 100
    };
  },

  // Bulk Operations
  async bulkUpdateMachineStatus(machineIds: string[], status: MachineStatus, reason: string, performedBy?: string) {
    const updated: Machine[] = [];
    for (const id of machineIds) {
      try {
        const m = await this.setMachineStatus(id, status, reason, performedBy);
        updated.push(m);
      } catch (err) {
        console.error(`Failed to update machine ${id}:`, err);
      }
    }
    store.save();
    return updated;
  },

  async bulkRelocateMachines(machineIds: string[], targetLocationId: string, reason: string, performedBy?: string) {
    const updated: Machine[] = [];
    for (const id of machineIds) {
      try {
        const m = await this.relocateMachine(id, targetLocationId, reason, performedBy);
        updated.push(m);
      } catch (err) {
        console.error(`Failed to relocate machine ${id}:`, err);
      }
    }
    store.save();
    return updated;
  },

  async bulkDeactivateMachines(machineIds: string[], reason: string) {
    return this.bulkUpdateMachineStatus(machineIds, 'DEACTIVATED', reason);
  },

  async bulkActivateMachines(machineIds: string[]) {
    return this.bulkUpdateMachineStatus(machineIds, 'OPERATIONAL', 'Bulk re-activated to service');
  },

  async deleteMachine(id: string) {
    try {
      const res = await apiFetch<any>(`/machines/${id}`, {
        method: 'DELETE'
      });
      const idx = store.machines.findIndex(m => m.id === id || m.publicId === id || m.machineNumber === id);
      if (idx !== -1) {
        store.machines.splice(idx, 1);
        store.save(false);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
      }
      return res;
    } catch {
      const idx = store.machines.findIndex(m => m.id === id || m.publicId === id || m.machineNumber === id);
      if (idx !== -1) {
        const deleted = store.machines[idx];
        store.machines.splice(idx, 1);
        store.auditLogs.unshift({
          id: `aud-${Date.now()}`,
          action: 'MACHINE_DELETED',
          entityName: 'Machine',
          entityId: deleted.machineNumber,
          oldValues: {
            id: deleted.id,
            machineNumber: deleted.machineNumber,
            serialNumber: deleted.serialNumber,
            machineType: deleted.machineType,
            location: deleted.currentLocation?.fullDescription
          },
          newValues: { status: 'DELETED' },
          createdAt: new Date().toISOString()
        });
        store.save();
        return { success: true, deletedMachine: deleted };
      }
      throw new Error('Machine not found');
    }
  },

  async relocateMachine(id: string, locationId: string, reason: string) {
    try {
      return await apiFetch<Machine>(`/machines/${id}/relocate`, {
        method: 'POST',
        body: JSON.stringify({ location_id: locationId, reason })
      });
    } catch {
      const mch = store.machines.find(m => m.id === id);
      const loc = store.locations.find(l => l.id === locationId);
      if (mch && loc) {
        mch.currentLocation = loc;
        mch.updatedAt = new Date().toISOString();
        // Log to audit
        store.auditLogs.unshift({
          id: `aud-${Date.now()}`,
          action: 'MACHINE_RELOCATED',
          entityName: 'Machine',
          entityId: mch.machineNumber,
          oldValues: { location: mch.currentLocation?.fullDescription },
          newValues: { location: loc.fullDescription, reason },
          createdAt: new Date().toISOString()
        });
        store.save();
        return mch;
      }
      throw new Error('Machine or location not found');
    }
  },

  // Buildings & Locations
  async getBuildings(includeDeleted = false) {
    try {
      const res = await apiFetch<any>(includeDeleted ? '/buildings?include_deleted=true' : '/buildings');
      return res.items || res;
    } catch {
      const blds = includeDeleted ? store.buildings : store.buildings.filter(b => !b.isDeleted);
      return blds.map(b => {
        const floors = store.floors.filter(f => f.buildingId === b.id && !f.isDeleted);
        return {
          ...b,
          floors: b.floors && b.floors.length > 0 ? b.floors : floors
        };
      });
    }
  },

  async getBuildingById(id: string) {
    try {
      return await apiFetch<Building>(`/buildings/${id}`);
    } catch {
      const b = store.buildings.find(bld => bld.id === id || bld.code === id) || null;
      if (!b) return null;
      const floors = store.floors.filter(f => f.buildingId === b.id && !f.isDeleted);
      return {
        ...b,
        floors: b.floors && b.floors.length > 0 ? b.floors : floors
      };
    }
  },

  async checkBuildingReferences(id: string): Promise<{
    canDelete: boolean;
    referenceCounts: Array<{ label: string; count: number }>;
  }> {
    const bld = store.buildings.find(b => b.id === id || b.code === id);
    if (!bld) return { canDelete: true, referenceCounts: [] };

    const bldFloors = store.floors.filter(f => f.buildingId === bld.id && !f.isDeleted);
    const bldLocations = store.locations.filter(l => l.buildingId === bld.id && !l.isDeleted);
    const bldMachines = store.machines.filter(m => m.currentLocation?.buildingId === bld.id && !m.isDeleted);
    const bldTickets = store.tickets.filter(t => t.location?.buildingId === bld.id && !t.isDeleted);

    const counts = [
      { label: 'Floors', count: bldFloors.length },
      { label: 'Locations / Zones', count: bldLocations.length },
      { label: 'Active Machines', count: bldMachines.length },
      { label: 'Historical Tickets', count: bldTickets.length }
    ];

    const hasCriticalReferences = bldLocations.length > 0 || bldMachines.length > 0 || bldTickets.length > 0;
    return {
      canDelete: !hasCriticalReferences,
      referenceCounts: counts
    };
  },

  async createBuilding(building: Omit<Partial<Building>, 'floors'> & { floors?: Array<Partial<Floor> & { floorNumber?: string | number; name?: string; nameAr?: string; floorName?: string; floorNameAr?: string; levelOrder?: number }> }) {
    try {
      return await apiFetch<Building>('/buildings', {
        method: 'POST',
        body: JSON.stringify(building)
      });
    } catch {
      const newBld: Building = {
        id: `bld-${Date.now()}`,
        name: building.name || 'New Building',
        nameAr: building.nameAr,
        code: (building.code || `BLD-${Date.now().toString().slice(-3)}`).trim().toUpperCase(),
        address: building.address,
        latitude: typeof building.latitude === 'number' ? building.latitude : null,
        longitude: typeof building.longitude === 'number' ? building.longitude : null,
        locationSource: typeof building.latitude === 'number' && typeof building.longitude === 'number' ? normalizeExplicitLocationSource(building.locationSource || 'MANUAL_ENTRY') : 'NONE',
        locationStatus: typeof building.latitude === 'number' && typeof building.longitude === 'number' ? 'GPS_CONFIGURED' : 'LOCATION_NOT_CONFIGURED',
        locationNote: building.locationNote || '',
        locationUpdatedAt: typeof building.latitude === 'number' && typeof building.longitude === 'number' ? new Date().toISOString() : undefined,
        locationUpdatedByActorName: building.locationUpdatedByActorName || 'Super Administrator',
        isActive: true,
        isDeleted: false,
        floors: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (building.floors && building.floors.length > 0) {
        const createdFloors: Floor[] = building.floors.map((flr, idx) => {
          const flrObj: Floor = {
            id: `flr-${Date.now()}-${idx}`,
            buildingId: newBld.id,
            floorName: flr.floorName || flr.name || `Floor ${flr.floorNumber || idx + 1}`,
            floorNameAr: flr.floorNameAr || flr.nameAr,
            levelOrder: flr.levelOrder ?? idx,
            isActive: true,
            isDeleted: false,
            createdAt: new Date().toISOString()
          };
          store.floors.push(flrObj);
          return flrObj;
        });
        newBld.floors = createdFloors;
      } else {
        const defaultFloor: Floor = {
          id: `flr-${Date.now()}-0`,
          buildingId: newBld.id,
          floorName: 'Ground Floor',
          floorNameAr: 'الطابق الأرضي',
          levelOrder: 0,
          isActive: true,
          isDeleted: false,
          createdAt: new Date().toISOString()
        };
        store.floors.push(defaultFloor);
        newBld.floors = [defaultFloor];
      }

      store.buildings.push(newBld);

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'BUILDING_CREATED',
        entityName: 'Building',
        entityId: newBld.code || newBld.id,
        userName: 'Super Administrator',
        newValues: { name: newBld.name, code: newBld.code, address: newBld.address },
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });

      return newBld;
    }
  },

  async updateBuilding(id: string, updates: Partial<Building>) {
    try {
      const serverUpdated = await apiFetch<Building>(`/buildings/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      const idx = store.buildings.findIndex(b => b.id === id || b.code === id);
      if (idx !== -1) {
        store.buildings[idx] = { ...store.buildings[idx], ...serverUpdated };
        store.save(false);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
      }
      return serverUpdated;
    } catch {
      const bld = store.buildings.find(b => b.id === id || b.code === id);
      if (!bld) throw new Error('Building not found');

      const oldValues = {
        name: bld.name,
        code: bld.code,
        address: bld.address,
        isActive: bld.isActive,
        latitude: bld.latitude,
        longitude: bld.longitude,
        locationSource: bld.locationSource,
        locationStatus: bld.locationStatus
      };
      if (updates.name !== undefined) bld.name = updates.name.trim();
      if (updates.nameAr !== undefined) bld.nameAr = updates.nameAr.trim();
      if (updates.code !== undefined) bld.code = updates.code.trim().toUpperCase();
      if (updates.address !== undefined) bld.address = updates.address.trim();
      if (updates.isActive !== undefined) bld.isActive = updates.isActive;

      const hadCoords = oldValues.latitude !== null && oldValues.latitude !== undefined &&
                        oldValues.longitude !== null && oldValues.longitude !== undefined;
      const hasCoordsPayload = updates.latitude !== undefined || updates.longitude !== undefined;

      let coordinatesActuallyChanged = false;
      if (hasCoordsPayload) {
        const isBothNull = updates.latitude === null && updates.longitude === null;
        if (isBothNull && !hadCoords) {
          coordinatesActuallyChanged = false;
        } else if (
          typeof updates.latitude === 'number' &&
          typeof updates.longitude === 'number' &&
          typeof oldValues.latitude === 'number' &&
          typeof oldValues.longitude === 'number'
        ) {
          coordinatesActuallyChanged =
            Number(updates.latitude.toFixed(6)) !== Number(oldValues.latitude.toFixed(6)) ||
            Number(updates.longitude.toFixed(6)) !== Number(oldValues.longitude.toFixed(6));
        } else {
          coordinatesActuallyChanged = true;
        }
      }

      if (coordinatesActuallyChanged) {
        const isLatNum = typeof updates.latitude === 'number' && !isNaN(updates.latitude) && isFinite(updates.latitude);
        const isLngNum = typeof updates.longitude === 'number' && !isNaN(updates.longitude) && isFinite(updates.longitude);
        if (isLatNum && isLngNum) {
          bld.latitude = Number(updates.latitude.toFixed(6));
          bld.longitude = Number(updates.longitude.toFixed(6));
          bld.locationSource = normalizeExplicitLocationSource(updates.locationSource || 'MANUAL_ENTRY');
          bld.locationStatus = 'GPS_CONFIGURED';
          bld.locationUpdatedAt = new Date().toISOString();
        } else {
          bld.latitude = null;
          bld.longitude = null;
          bld.locationSource = 'NONE';
          bld.locationStatus = 'LOCATION_NOT_CONFIGURED';
          bld.locationUpdatedAt = null;
        }
      }

      if (updates.locationNote !== undefined) bld.locationNote = updates.locationNote;
      if (updates.locationUpdatedByActorName) bld.locationUpdatedByActorName = updates.locationUpdatedByActorName;

      bld.updatedAt = new Date().toISOString();

      // Audit location change specifically if location changed
      if (coordinatesActuallyChanged) {
        const hasCoords = bld.latitude !== null && bld.longitude !== null;
        let auditAction = 'BUILDING_LOCATION_MANUALLY_UPDATED';
        if (hadCoords && !hasCoords) {
          auditAction = 'BUILDING_LOCATION_CLEARED';
        } else if (bld.locationSource === 'DEVICE_GPS') {
          auditAction = 'BUILDING_LOCATION_DEVICE_GPS_UPDATED';
        } else if (bld.locationSource === 'MAP_PICKER' || bld.locationSource === 'MAP_SELECTION') {
          auditAction = 'BUILDING_LOCATION_MAP_UPDATED';
        }

        store.auditLogs.unshift({
          id: `aud-${Date.now()}`,
          action: auditAction,
          entityName: 'Building',
          entityId: bld.code || bld.id,
          userName: bld.locationUpdatedByActorName || 'Super Administrator',
          oldValues: {
            latitude: oldValues.latitude,
            longitude: oldValues.longitude,
            locationSource: oldValues.locationSource,
            locationStatus: oldValues.locationStatus
          },
          newValues: {
            latitude: bld.latitude,
            longitude: bld.longitude,
            locationSource: bld.locationSource,
            locationStatus: bld.locationStatus,
            locationNote: bld.locationNote
          },
          createdAt: new Date().toISOString()
        });
      } else {
        store.auditLogs.unshift({
          id: `aud-${Date.now()}`,
          action: 'BUILDING_UPDATED',
          entityName: 'Building',
          entityId: bld.code || bld.id,
          oldValues,
          newValues: { name: bld.name, code: bld.code, address: bld.address, isActive: bld.isActive },
          createdAt: new Date().toISOString()
        });
      }

      return bld;
    }
  },

  async deactivateBuilding(id: string, reason?: string) {
    const bld = store.buildings.find(b => b.id === id || b.code === id);
    if (!bld) throw new Error('Building not found');

    bld.isActive = false;
    bld.deactivatedAt = new Date().toISOString();
    bld.deactivatedBy = 'System Admin';
    bld.deactivationReason = reason || 'Operational deactivation';
    bld.updatedAt = new Date().toISOString();

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'BUILDING_DEACTIVATED',
      entityName: 'Building',
      entityId: bld.code || bld.id,
      newValues: { isActive: false, reason: bld.deactivationReason },
      createdAt: new Date().toISOString()
    });

    return bld;
  },

  async reactivateBuilding(id: string) {
    const bld = store.buildings.find(b => b.id === id || b.code === id);
    if (!bld) throw new Error('Building not found');

    bld.isActive = true;
    bld.deactivatedAt = undefined;
    bld.deactivatedBy = undefined;
    bld.deactivationReason = undefined;
    bld.updatedAt = new Date().toISOString();

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'BUILDING_REACTIVATED',
      entityName: 'Building',
      entityId: bld.code || bld.id,
      newValues: { isActive: true },
      createdAt: new Date().toISOString()
    });

    return bld;
  },

  async deleteBuilding(id: string, hardDelete = false, reason?: string) {
    const bld = store.buildings.find(b => b.id === id || b.code === id);
    if (!bld) throw new Error('Building not found');

    const refs = await this.checkBuildingReferences(bld.id);
    if (hardDelete && !refs.canDelete) {
      throw new Error(
        `Cannot permanently delete building "${bld.name}" (${bld.code}) because it is referenced by existing locations, machines, or tickets. Please deactivate the building instead.`
      );
    }

    if (hardDelete) {
      const idx = store.buildings.findIndex(b => b.id === bld.id);
      if (idx !== -1) store.buildings.splice(idx, 1);

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'BUILDING_PURGED',
        entityName: 'Building',
        entityId: bld.code || bld.id,
        newValues: { name: bld.name, reason: reason || 'Hard delete by Super Admin' },
        createdAt: new Date().toISOString()
      });
    } else {
      bld.isDeleted = true;
      bld.isActive = false;
      bld.deletedAt = new Date().toISOString();
      bld.deletedBy = 'System Admin';
      bld.deletionReason = reason || 'Soft deleted / archived';
      bld.updatedAt = new Date().toISOString();

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'BUILDING_DELETED',
        entityName: 'Building',
        entityId: bld.code || bld.id,
        newValues: { isDeleted: true, reason: bld.deletionReason },
        createdAt: new Date().toISOString()
      });
    }

    return { success: true };
  },

  async getFloors(buildingId?: string) {
    try {
      return await apiFetch<Floor[]>(buildingId ? `/floors?building_id=${buildingId}` : '/floors');
    } catch {
      return buildingId ? store.floors.filter(f => f.buildingId === buildingId && !f.isDeleted) : store.floors.filter(f => !f.isDeleted);
    }
  },

  async createFloor(floor: Partial<Floor>) {
    try {
      return await apiFetch<Floor>('/floors', {
        method: 'POST',
        body: JSON.stringify(floor)
      });
    } catch {
      const newFlr: Floor = {
        id: `flr-${Date.now()}`,
        buildingId: floor.buildingId || store.buildings[0].id,
        floorName: floor.floorName || 'New Floor',
        floorNameAr: floor.floorNameAr,
        levelOrder: floor.levelOrder || 0,
        isActive: true,
        isDeleted: false,
        createdAt: new Date().toISOString()
      };
      store.floors.push(newFlr);

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'FLOOR_CREATED',
        entityName: 'Floor',
        entityId: newFlr.id,
        newValues: { floorName: newFlr.floorName, buildingId: newFlr.buildingId },
        createdAt: new Date().toISOString()
      });

      return newFlr;
    }
  },

  async updateFloor(id: string, updates: Partial<Floor>) {
    const flr = store.floors.find(f => f.id === id);
    if (!flr) throw new Error('Floor not found');

    if (updates.floorName !== undefined) flr.floorName = updates.floorName.trim();
    if (updates.floorNameAr !== undefined) flr.floorNameAr = updates.floorNameAr.trim();
    if (updates.levelOrder !== undefined) flr.levelOrder = Number(updates.levelOrder);
    if (updates.isActive !== undefined) flr.isActive = updates.isActive;

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'FLOOR_UPDATED',
      entityName: 'Floor',
      entityId: flr.id,
      newValues: { floorName: flr.floorName, levelOrder: flr.levelOrder },
      createdAt: new Date().toISOString()
    });

    return flr;
  },

  async checkFloorReferences(id: string): Promise<{
    canDelete: boolean;
    referenceCounts: Array<{ label: string; count: number }>;
  }> {
    const flr = store.floors.find(f => f.id === id);
    if (!flr) return { canDelete: true, referenceCounts: [] };

    const locs = store.locations.filter(l => l.floorId === flr.id && !l.isDeleted);
    return {
      canDelete: locs.length === 0,
      referenceCounts: [{ label: 'Active Location Zones', count: locs.length }]
    };
  },

  async deleteFloor(id: string, hardDelete = false, reason?: string) {
    const flr = store.floors.find(f => f.id === id);
    if (!flr) throw new Error('Floor not found');

    const linkedLocations = store.locations.filter(l => l.floorId === flr.id && !l.isDeleted);
    if (linkedLocations.length > 0) {
      throw new Error(`Cannot delete floor "${flr.floorName}" because it contains ${linkedLocations.length} active location zones.`);
    }

    flr.isDeleted = true;
    flr.isActive = false;

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'FLOOR_DELETED',
      entityName: 'Floor',
      entityId: flr.id,
      newValues: { isDeleted: true, reason },
      createdAt: new Date().toISOString()
    });

    return { success: true };
  },

  async getLocations(includeDeleted = false) {
    try {
      const res = await apiFetch<any>(includeDeleted ? '/locations?include_deleted=true' : '/locations');
      return res.items || res;
    } catch {
      return includeDeleted ? store.locations : store.locations.filter(l => !l.isDeleted);
    }
  },

  async getLocationById(id: string) {
    try {
      return await apiFetch<Location>(`/locations/${id}`);
    } catch {
      return store.locations.find(l => l.id === id) || null;
    }
  },

  async checkLocationReferences(id: string): Promise<{
    canDelete: boolean;
    referenceCounts: Array<{ label: string; count: number }>;
  }> {
    const loc = store.locations.find(l => l.id === id);
    if (!loc) return { canDelete: true, referenceCounts: [] };

    const locMachines = store.machines.filter(m => m.currentLocation?.id === loc.id && !m.isDeleted);
    const locTickets = store.tickets.filter(t => (t.locationId === loc.id || t.location?.id === loc.id) && !t.isDeleted);

    const counts = [
      { label: 'Assigned Machines', count: locMachines.length },
      { label: 'Associated Tickets', count: locTickets.length }
    ];

    const hasReferences = locMachines.length > 0 || locTickets.length > 0;
    return {
      canDelete: !hasReferences,
      referenceCounts: counts
    };
  },

  async createLocation(location: Partial<Location>) {
    try {
      return await apiFetch<Location>('/locations', {
        method: 'POST',
        body: JSON.stringify(location)
      });
    } catch {
      const bld = store.buildings.find(b => b.id === location.buildingId);
      const flr = store.floors.find(f => f.id === location.floorId);
      const area = (location.areaZone || 'General Area').trim();
      const newLoc: Location = {
        id: `loc-${Date.now()}`,
        buildingId: location.buildingId || store.buildings[0].id,
        floorId: location.floorId,
        areaZone: area,
        areaZoneAr: location.areaZoneAr,
        fullDescription: `${bld?.name || ''} > ${flr?.floorName || ''} > ${area}`,
        isActive: true,
        isDeleted: false,
        building: bld,
        floor: flr,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      store.locations.push(newLoc);

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'LOCATION_CREATED',
        entityName: 'Location',
        entityId: newLoc.id,
        newValues: { fullDescription: newLoc.fullDescription, areaZone: newLoc.areaZone },
        createdAt: new Date().toISOString()
      });

      store.save();
      return newLoc;
    }
  },

  async updateLocation(id: string, updates: Partial<Location>) {
    try {
      const serverUpdated = await apiFetch<Location>(`/locations/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      const idx = store.locations.findIndex(l => l.id === id);
      if (idx !== -1) {
        store.locations[idx] = { ...store.locations[idx], ...serverUpdated };
        store.save(false);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
      }
      return serverUpdated;
    } catch {
      const loc = store.locations.find(l => l.id === id);
      if (!loc) throw new Error('Location not found');

      const oldValues = { areaZone: loc.areaZone, buildingId: loc.buildingId, floorId: loc.floorId, isActive: loc.isActive };
      if (updates.buildingId !== undefined) {
        loc.buildingId = updates.buildingId;
        loc.building = store.buildings.find(b => b.id === updates.buildingId);
      }
      if (updates.floorId !== undefined) {
        loc.floorId = updates.floorId;
        loc.floor = store.floors.find(f => f.id === updates.floorId);
      }
      if (updates.areaZone !== undefined) loc.areaZone = updates.areaZone.trim();
      if (updates.areaZoneAr !== undefined) loc.areaZoneAr = updates.areaZoneAr.trim();
      if (updates.isActive !== undefined) loc.isActive = updates.isActive;

      loc.fullDescription = `${loc.building?.name || ''} > ${loc.floor?.floorName || ''} > ${loc.areaZone}`;
      loc.updatedAt = new Date().toISOString();

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'LOCATION_UPDATED',
        entityName: 'Location',
        entityId: loc.id,
        oldValues,
        newValues: { areaZone: loc.areaZone, fullDescription: loc.fullDescription, isActive: loc.isActive },
        createdAt: new Date().toISOString()
      });

      store.save();
      return loc;
    }
  },

  async deactivateLocation(id: string, reason?: string) {
    const loc = store.locations.find(l => l.id === id);
    if (!loc) throw new Error('Location not found');

    loc.isActive = false;
    loc.deactivatedAt = new Date().toISOString();
    loc.deactivatedBy = 'System Admin';
    loc.deactivationReason = reason || 'Operational deactivation';
    loc.updatedAt = new Date().toISOString();

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'LOCATION_DEACTIVATED',
      entityName: 'Location',
      entityId: loc.id,
      newValues: { isActive: false, reason: loc.deactivationReason },
      createdAt: new Date().toISOString()
    });

    store.save();
    return loc;
  },

  async reactivateLocation(id: string) {
    const loc = store.locations.find(l => l.id === id);
    if (!loc) throw new Error('Location not found');

    loc.isActive = true;
    loc.deactivatedAt = undefined;
    loc.deactivatedBy = undefined;
    loc.deactivationReason = undefined;
    loc.updatedAt = new Date().toISOString();

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'LOCATION_REACTIVATED',
      entityName: 'Location',
      entityId: loc.id,
      newValues: { isActive: true },
      createdAt: new Date().toISOString()
    });

    store.save();
    return loc;
  },

  async deleteLocation(id: string, hardDelete = false, reason?: string) {
    const loc = store.locations.find(l => l.id === id);
    if (!loc) throw new Error('Location not found');

    const refs = await this.checkLocationReferences(loc.id);
    if (hardDelete && !refs.canDelete) {
      throw new Error(
        `Cannot permanently delete location zone "${loc.areaZone}" because it is currently assigned to active machines or historical tickets. Please deactivate the location instead.`
      );
    }

    if (hardDelete) {
      const idx = store.locations.findIndex(l => l.id === loc.id);
      if (idx !== -1) store.locations.splice(idx, 1);

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'LOCATION_PURGED',
        entityName: 'Location',
        entityId: loc.id,
        newValues: { areaZone: loc.areaZone, reason: reason || 'Hard delete by Super Admin' },
        createdAt: new Date().toISOString()
      });
    } else {
      loc.isDeleted = true;
      loc.isActive = false;
      loc.deletedAt = new Date().toISOString();
      loc.deletedBy = 'System Admin';
      loc.deletionReason = reason || 'Soft deleted / archived';
      loc.updatedAt = new Date().toISOString();

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'LOCATION_DELETED',
        entityName: 'Location',
        entityId: loc.id,
        newValues: { isDeleted: true, reason: loc.deletionReason },
        createdAt: new Date().toISOString()
      });
    }

    store.save();
    return { success: true };
  },

  // Tickets & Maintenance
  async getTickets() {
    try {
      const res = await apiFetch<any>('/tickets');
      const items = Array.isArray(res) ? res : (res.items || []);
      if (items.length > 0) {
        store.tickets = items;
      }
      return items;
    } catch {
      return store.tickets;
    }
  },

  async getTicketById(id: string) {
    try {
      return await apiFetch<Ticket>(`/tickets/${id}`);
    } catch {
      return store.tickets.find(t => t.id === id || t.ticketNumber === id) || null;
    }
  },

  async createTicket(ticket: Partial<Ticket>) {
    try {
      return await apiFetch<Ticket>('/tickets', {
        method: 'POST',
        body: JSON.stringify(ticket)
      });
    } catch {
      store.sync();
      const mch = store.machines.find(m => m.id === ticket.machineId || m.machineNumber === ticket.machineId);
      const count = store.tickets.length + 1;
      const numStr = String(count).padStart(4, '0');
      const now = new Date().toISOString();
      const newTck: Ticket = {
        id: `tck-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        ticketNumber: `TCK-2026-${numStr}`,
        title: ticket.title || ticket.description || 'Reported Issue',
        titleAr: ticket.titleAr,
        machineId: mch?.id || ticket.machineId || store.machines[0]?.id || 'mch-001',
        machine: mch,
        locationId: mch?.currentLocation?.id || store.locations[0]?.id || 'loc-001',
        location: mch?.currentLocation,
        source: ticket.source || 'MANUAL',
        category: ticket.category || 'OTHER',
        faultType: ticket.faultType,
        priority: ticket.priority || 'MEDIUM',
        status: ticket.status || 'NEW',
        description: ticket.description || 'Reported maintenance issue',
        descriptionAr: ticket.descriptionAr,
        reporterName: ticket.reporterName || (ticket as any).reportedBy || 'Operator',
        reporterPhone: ticket.reporterPhone,
        isRecurring: false,
        recurringOccurrenceCount: 1,
        slaDueAt: new Date(Date.now() + 4 * 3600000).toISOString(),
        totalPartsCost: 0,
        timeline: [
          {
            id: `tl-${Date.now()}`,
            ticketId: `tck-${Date.now()}`,
            timestamp: now,
            action: 'CREATED',
            actionLabel: ticket.source === 'CUSTOMER_QR' ? 'بلاغ من عميل عبر QR' : 'Ticket Opened',
            description: ticket.description || 'Ticket opened in maintenance workflow.'
          }
        ],
        createdAt: now,
        updatedAt: now
      };
      store.tickets.unshift(newTck);

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'TICKET_CREATED',
        entityName: 'Ticket',
        entityId: newTck.ticketNumber,
        userName: ticket.source === 'CUSTOMER_QR' ? 'Customer via QR' : 'Super Administrator',
        newValues: { title: newTck.title, category: newTck.category, priority: newTck.priority, source: newTck.source, machine: mch?.machineNumber },
        timestamp: now,
        createdAt: now
      });

      store.save();
      return newTck;
    }
  },

  async submitPublicReport(report: { machine_public_id: string; category: FaultCategory; description: string; reporter_name?: string; reporter_phone?: string }) {
    try {
      return await apiFetch<Ticket>('/tickets/public-report', {
        method: 'POST',
        body: JSON.stringify(report)
      });
    } catch {
      const mch = store.machines.find(m => m.publicId === report.machine_public_id || m.machineNumber === report.machine_public_id) || store.machines[0];
      const count = store.tickets.length + 1;
      const newTck: Ticket = {
        id: `tck-${Date.now()}`,
        ticketNumber: `TCK-2026-${String(count).padStart(4, '0')}`,
        machineId: mch.id,
        machine: mch,
        locationId: mch.currentLocation?.id || store.locations[0].id,
        location: mch.currentLocation,
        source: 'CUSTOMER_QR',
        category: report.category,
        priority: 'HIGH',
        status: 'NEW',
        description: report.description,
        reporterName: report.reporter_name || 'Customer via QR',
        reporterPhone: report.reporter_phone,
        isRecurring: false,
        recurringOccurrenceCount: 1,
        slaDueAt: new Date(Date.now() + 4 * 3600000).toISOString(),
        totalPartsCost: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      store.tickets.unshift(newTck);
      store.save();
      return newTck;
    }
  },

  async assignTicket(ticketId: string, technicianId: string, comment?: string) {
    try {
      return await apiFetch<Ticket>(`/tickets/${ticketId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ technician_id: technicianId, comment })
      });
    } catch {
      const tck = store.tickets.find(t => t.id === ticketId);
      const tech = store.technicians.find(t => t.id === technicianId);
      if (tck && tech) {
        const prevStatus = tck.status;
        tck.assignedTechnicianId = tech.id;
        tck.assignedTechnician = tech;
        tck.status = 'ASSIGNED';
        tck.updatedAt = new Date().toISOString();

        if (!tck.timeline) tck.timeline = [];
        if (!tck.statusHistory) tck.statusHistory = [];

        const now = new Date().toISOString();
        tck.statusHistory.push({
          id: `sh-${Date.now()}`,
          ticketId: tck.id,
          previousStatus: prevStatus,
          newStatus: 'ASSIGNED',
          comment: comment || `Assigned to ${tech.fullName || tech.employeeCode}`,
          createdAt: now
        });

        tck.timeline.unshift({
          id: `tl-${Date.now()}`,
          ticketId: tck.id,
          timestamp: now,
          technicianId: tech.id,
          technicianName: tech.fullName || tech.employeeCode,
          technicianCode: tech.employeeCode,
          action: 'ASSIGNED',
          actionLabel: 'Ticket Assigned',
          description: comment || `Ticket assigned to ${tech.fullName || tech.employeeCode} (${tech.specialization || 'Technician'})`
        });

        store.auditLogs.unshift({
          id: `aud-${Date.now()}`,
          action: 'TICKET_ASSIGNED',
          entityName: 'Ticket',
          entityId: tck.ticketNumber,
          oldValues: { status: prevStatus },
          newValues: { status: 'ASSIGNED', technicianId: tech.id, technicianName: tech.fullName || tech.employeeCode },
          createdAt: now
        });

        store.save();
        return tck;
      }
      throw new Error('Ticket or Technician not found');
    }
  },

  async triageTicket(ticketId: string, payload: { priority?: TicketPriority; category?: FaultCategory; comment?: string }) {
    try {
      const updatedTck = await apiFetch<Ticket>(`/tickets/${ticketId}/triage`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const idx = store.tickets.findIndex(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (idx !== -1) {
        store.tickets[idx] = updatedTck;
      }
      store.save();
      return updatedTck;
    } catch {
      const tck = store.tickets.find(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (!tck) throw new Error('Ticket not found');

      const prevStatus = tck.status;
      tck.status = 'TRIAGED';
      tck.triagedAt = new Date().toISOString();
      if (payload.priority) tck.priority = payload.priority;
      if (payload.category) tck.category = payload.category;
      tck.updatedAt = new Date().toISOString();

      if (!tck.timeline) tck.timeline = [];
      if (!tck.statusHistory) tck.statusHistory = [];

      const now = new Date().toISOString();
      tck.statusHistory.push({
        id: `sh-${Date.now()}`,
        ticketId: tck.id,
        previousStatus: prevStatus,
        newStatus: 'TRIAGED',
        comment: payload.comment || 'Ticket reviewed and triaged',
        createdAt: now
      });

      tck.timeline.unshift({
        id: `tl-${Date.now()}`,
        ticketId: tck.id,
        timestamp: now,
        action: 'TRIAGED',
        actionLabel: 'Ticket Triaged',
        description: payload.comment || `Triaged: Priority set to ${tck.priority}, Category: ${tck.category}`
      });

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'TICKET_TRIAGED',
        entityName: 'Ticket',
        entityId: tck.ticketNumber,
        oldValues: { status: prevStatus },
        newValues: { status: 'TRIAGED', priority: tck.priority, category: tck.category },
        createdAt: now
      });

      store.save();
      return tck;
    }
  },

  async acceptTicket(ticketId: string, technicianId?: string, comment?: string) {
    try {
      const updatedTck = await apiFetch<Ticket>(`/tickets/${ticketId}/accept`, {
        method: 'POST',
        body: JSON.stringify({ technician_id: technicianId, comment })
      });
      const idx = store.tickets.findIndex(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (idx !== -1) {
        store.tickets[idx] = updatedTck;
      }
      store.save();
      return updatedTck;
    } catch {
      const tck = store.tickets.find(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (!tck) throw new Error('Ticket not found');

      const tech = store.technicians.find(t => t.id === (technicianId || tck.assignedTechnicianId)) || store.technicians[0];
      tck.assignedTechnicianId = tech.id;
      tck.assignedTechnician = tech;
      tck.acknowledgedAt = new Date().toISOString();
      tck.updatedAt = new Date().toISOString();

      if (!tck.timeline) tck.timeline = [];
      const now = new Date().toISOString();

      tck.timeline.unshift({
        id: `tl-${Date.now()}`,
        ticketId: tck.id,
        timestamp: now,
        technicianId: tech.id,
        technicianName: tech.fullName || tech.employeeCode,
        technicianCode: tech.employeeCode,
        action: 'ACCEPTED',
        actionLabel: 'Ticket Accepted',
        description: comment || `${tech.fullName || tech.employeeCode} accepted dispatch assignment and acknowledged SLA target.`
      });

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'TICKET_ACCEPTED',
        entityName: 'Ticket',
        entityId: tck.ticketNumber,
        newValues: { acknowledgedAt: tck.acknowledgedAt, technician: tech.employeeCode },
        createdAt: now
      });

      store.save();
      return tck;
    }
  },

  async startWork(ticketId: string, technicianId?: string, comment?: string) {
    try {
      const updatedTck = await apiFetch<Ticket>(`/tickets/${ticketId}/start-work`, {
        method: 'POST',
        body: JSON.stringify({ technician_id: technicianId, comment })
      });
      const idx = store.tickets.findIndex(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (idx !== -1) {
        store.tickets[idx] = updatedTck;
      }
      store.save();
      return updatedTck;
    } catch {
      const tck = store.tickets.find(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (!tck) throw new Error('Ticket not found');

      const prevStatus = tck.status;
      const tech = store.technicians.find(t => t.id === (technicianId || tck.assignedTechnicianId)) || store.technicians[0];
      tck.assignedTechnicianId = tech.id;
      tck.assignedTechnician = tech;
      tck.status = 'IN_PROGRESS';
      if (!tck.startedAt) tck.startedAt = new Date().toISOString();
      tck.updatedAt = new Date().toISOString();

      if (!tck.timeline) tck.timeline = [];
      if (!tck.statusHistory) tck.statusHistory = [];

      const now = new Date().toISOString();
      tck.statusHistory.push({
        id: `sh-${Date.now()}`,
        ticketId: tck.id,
        previousStatus: prevStatus,
        newStatus: 'IN_PROGRESS',
        comment: comment || 'On-site maintenance initiated',
        createdAt: now
      });

      tck.timeline.unshift({
        id: `tl-${Date.now()}`,
        ticketId: tck.id,
        timestamp: now,
        technicianId: tech.id,
        technicianName: tech.fullName || tech.employeeCode,
        technicianCode: tech.employeeCode,
        action: 'WORK_STARTED',
        actionLabel: 'Started Work',
        description: comment || `Technician on site at ${tck.location?.fullDescription || 'machine location'}. Commencing disassembly and diagnostics.`
      });

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'WORK_STARTED',
        entityName: 'Ticket',
        entityId: tck.ticketNumber,
        oldValues: { status: prevStatus },
        newValues: { status: 'IN_PROGRESS', startedAt: tck.startedAt },
        createdAt: now
      });

      store.save();
      return tck;
    }
  },

  async addTicketAction(ticketId: string, action: {
    technicianId?: string;
    actionType?: string;
    actionTaken?: string;
    description: string;
    rootCause?: string;
    durationMinutes?: number;
    partsReplaced?: Array<{ partNumber: string; name: string; quantity: number; unitCost: number }>;
    partsUsed?: Array<{ sparePart?: SparePart; partId?: string; quantity: number; unitCostAtUse: number }>;
  }) {
    try {
      const newAction = await apiFetch<MaintenanceAction>(`/tickets/${ticketId}/actions`, {
        method: 'POST',
        body: JSON.stringify(action)
      });
      const tck = store.tickets.find(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (tck) {
        if (!tck.maintenanceActions) tck.maintenanceActions = [];
        if (!tck.maintenanceActions.some(a => a.id === newAction.id)) {
          tck.maintenanceActions.unshift(newAction);
        }
        if (action.rootCause) tck.rootCause = action.rootCause;
        if (action.partsReplaced) {
          const partsCostDelta = action.partsReplaced.reduce((acc, p) => acc + (p.quantity * (p.unitCost || 0)), 0);
          tck.totalPartsCost = (tck.totalPartsCost || 0) + partsCostDelta;
        }
        tck.updatedAt = new Date().toISOString();
        store.save();
      }
      return newAction;
    } catch {
      const tck = store.tickets.find(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (!tck) throw new Error('Ticket not found');

      const tech = store.technicians.find(t => t.id === (action.technicianId || tck.assignedTechnicianId)) || store.technicians[0];
      const now = new Date().toISOString();

      if (action.rootCause) tck.rootCause = action.rootCause;
      if (!tck.maintenanceActions) tck.maintenanceActions = [];
      if (!tck.timeline) tck.timeline = [];

      const newAction: MaintenanceAction = {
        id: `ma-${Date.now()}`,
        ticketId: tck.id,
        technicianId: tech.id,
        technician: tech,
        actionType: action.actionType || 'CORRECTIVE_MAINTENANCE',
        actionTaken: action.actionTaken || action.description,
        description: action.description,
        rootCause: action.rootCause,
        durationMinutes: action.durationMinutes || 30,
        workDurationMinutes: action.durationMinutes || 30,
        partsReplaced: action.partsReplaced,
        partsUsed: action.partsUsed,
        performedAt: now,
        createdAt: now
      };

      tck.maintenanceActions.unshift(newAction);

      // Calculate total parts cost
      let partsCostDelta = 0;
      if (action.partsReplaced) {
        partsCostDelta = action.partsReplaced.reduce((acc, p) => acc + (p.quantity * (p.unitCost || 0)), 0);
        tck.totalPartsCost = (tck.totalPartsCost || 0) + partsCostDelta;
      }

      tck.timeline.unshift({
        id: `tl-${Date.now()}`,
        ticketId: tck.id,
        timestamp: now,
        technicianId: tech.id,
        technicianName: tech.fullName || tech.employeeCode,
        technicianCode: tech.employeeCode,
        action: 'ACTION_ADDED',
        actionLabel: action.actionType ? action.actionType.replace(/_/g, ' ') : 'Maintenance Action Logged',
        description: `${action.actionTaken || action.description}${action.durationMinutes ? ` (${action.durationMinutes} mins labor)` : ''}`,
        part: action.partsReplaced?.[0] ? {
          partNumber: action.partsReplaced[0].partNumber,
          name: action.partsReplaced[0].name,
          quantity: action.partsReplaced[0].quantity,
          unitCost: action.partsReplaced[0].unitCost
        } : undefined
      });

      tck.updatedAt = now;

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'MAINTENANCE_ACTION_ADDED',
        entityName: 'Ticket',
        entityId: tck.ticketNumber,
        newValues: { actionType: action.actionType, durationMinutes: action.durationMinutes, technician: tech.employeeCode },
        createdAt: now
      });

      store.save();
      return newAction;
    }
  },

  async uploadTicketPhoto(ticketId: string, photo: {
    fileName: string;
    fileUrl: string;
    fileType?: string;
    fileSize?: number;
    caption?: string;
    uploadedBy?: string;
    uploaderRole?: string;
  }) {
    try {
      const newAtt = await apiFetch<TicketAttachment>(`/tickets/${ticketId}/attachments`, {
        method: 'POST',
        body: JSON.stringify(photo)
      });
      const tck = store.tickets.find(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (tck) {
        if (!tck.attachments) tck.attachments = [];
        if (!tck.attachments.some(a => a.id === newAtt.id)) {
          tck.attachments.unshift(newAtt);
        }
        tck.updatedAt = new Date().toISOString();
        store.save();
      }
      return newAtt;
    } catch {
      const tck = store.tickets.find(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (!tck) throw new Error('Ticket not found');

      const now = new Date().toISOString();
      if (!tck.attachments) tck.attachments = [];
      if (!tck.timeline) tck.timeline = [];

      const newAtt: TicketAttachment = {
        id: `att-${Date.now()}`,
        ticketId: tck.id,
        fileName: photo.fileName,
        fileType: photo.fileType || 'image/jpeg',
        fileUrl: photo.fileUrl,
        fileSize: photo.fileSize || 1024 * 340,
        caption: photo.caption || 'Site inspection photo',
        uploadedBy: photo.uploadedBy || tck.assignedTechnician?.fullName || 'Technician',
        uploaderRole: photo.uploaderRole || 'TECHNICIAN',
        createdAt: now
      };

      tck.attachments.unshift(newAtt);

      tck.timeline.unshift({
        id: `tl-${Date.now()}`,
        ticketId: tck.id,
        timestamp: now,
        technicianName: newAtt.uploadedBy,
        action: 'PHOTO_UPLOADED',
        actionLabel: 'Photo Uploaded',
        description: photo.caption || `Uploaded inspection evidence: ${photo.fileName}`,
        attachment: {
          id: newAtt.id,
          fileName: newAtt.fileName,
          fileUrl: newAtt.fileUrl,
          fileType: newAtt.fileType,
          caption: newAtt.caption
        }
      });

      tck.updatedAt = now;

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'PHOTO_UPLOADED',
        entityName: 'Ticket',
        entityId: tck.ticketNumber,
        newValues: { fileName: photo.fileName, uploadedBy: newAtt.uploadedBy },
        createdAt: now
      });

      store.save();
      return newAtt;
    }
  },

  async addTicketNote(ticketId: string, note: {
    authorName: string;
    authorRole?: string;
    content: string;
    isInternal?: boolean;
  }) {
    try {
      const newNote = await apiFetch<TicketNote>(`/tickets/${ticketId}/notes`, {
        method: 'POST',
        body: JSON.stringify(note)
      });
      const tck = store.tickets.find(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (tck) {
        if (!tck.notes) tck.notes = [];
        if (!tck.notes.some(n => n.id === newNote.id)) {
          tck.notes.unshift(newNote);
        }
        tck.updatedAt = new Date().toISOString();
        store.save();
      }
      return newNote;
    } catch {
      const tck = store.tickets.find(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (!tck) throw new Error('Ticket not found');

      const now = new Date().toISOString();
      if (!tck.notes) tck.notes = [];
      if (!tck.timeline) tck.timeline = [];

      const newNote: TicketNote = {
        id: `nt-${Date.now()}`,
        ticketId: tck.id,
        authorName: note.authorName || 'Technician',
        authorRole: note.authorRole || 'Technician',
        content: note.content,
        isInternal: note.isInternal ?? true,
        createdAt: now
      };

      tck.notes.unshift(newNote);

      tck.timeline.unshift({
        id: `tl-${Date.now()}`,
        ticketId: tck.id,
        timestamp: now,
        technicianName: newNote.authorName,
        action: 'NOTE_ADDED',
        actionLabel: 'Work Log Note',
        description: note.content
      });

      tck.updatedAt = now;

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'NOTE_ADDED',
        entityName: 'Ticket',
        entityId: tck.ticketNumber,
        newValues: { author: newNote.authorName, isInternal: newNote.isInternal },
        createdAt: now
      });

      store.save();
      return newNote;
    }
  },

  async requestTicketPart(ticketId: string, partReq: {
    technicianId?: string;
    sparePartId?: string;
    partName?: string;
    partNumber?: string;
    isCustomPart?: boolean;
    estimatedCost?: number;
    quantity: number;
    priority?: TicketPriority;
    reason?: string;
    notes?: string;
  }) {
    try {
      const newReq = await apiFetch<SparePartRequest>(`/tickets/${ticketId}/part-requests`, {
        method: 'POST',
        body: JSON.stringify(partReq)
      });
      const tck = store.tickets.find(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (tck) {
        tck.status = 'WAITING_FOR_PART';
        tck.updatedAt = new Date().toISOString();
      }
      if (!store.partRequests.some(r => r.id === newReq.id)) {
        store.partRequests.unshift(newReq);
      }
      store.save();
      return newReq;
    } catch {
      const tck = store.tickets.find(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (!tck) throw new Error('Ticket not found');

      let part = store.spareParts.find(p => p.id === partReq.sparePartId);
      if (!part && partReq.partName) {
        const q = (partReq.partName || '').trim().toLowerCase();
        const qNum = (partReq.partNumber || '').trim().toLowerCase();
        part = store.spareParts.find(p =>
          (p.name && p.name.toLowerCase() === q) ||
          (p.nameAr && p.nameAr.toLowerCase() === q) ||
          (p.partNumber && p.partNumber.toLowerCase() === qNum) ||
          (p.partNumber && p.partNumber.toLowerCase() === q)
        );
      }

      const isCustomPart = !part || Boolean(partReq.isCustomPart);
      const partNumber = part ? part.partNumber : (partReq.partNumber?.trim() || `REQ-NEW-${Math.floor(1000 + Math.random() * 9000)}`);
      const partName = part ? (part.nameAr || part.name) : (partReq.partName?.trim() || 'قطعة غيار مخصصة');
      const unitCost = part ? part.unitCost : (Number(partReq.estimatedCost) || 0);
      const tech = store.technicians.find(t => t.id === (partReq.technicianId || tck.assignedTechnicianId)) || store.technicians[0];
      const prevStatus = tck.status;
      const now = new Date().toISOString();
      const quantity = Number(partReq.quantity) || 1;

      // Requisition item
      const newReq: SparePartRequest = {
        id: `req-${Date.now()}`,
        requestNumber: `REQ-${Math.floor(100000 + Math.random() * 900000)}`,
        ticketId: tck.id,
        ticket: tck,
        ticketNumber: tck.ticketNumber,
        machineId: tck.machineId,
        machineNumber: tck.machine?.machineNumber,
        technicianId: tech?.id,
        technician: tech,
        technicianName: tech?.fullName || tech?.employeeCode,
        partId: part?.id,
        sparePartId: part?.id,
        part: part || ({
          id: `custom-part-${Date.now()}`,
          partNumber,
          name: partName,
          nameAr: partName,
          category: 'GENERAL' as any,
          unitCost,
          currentQuantity: 0,
          minimumStockLevel: 0,
          reorderPoint: 0,
          reorderQuantity: 0,
          storageLocation: 'غير مدرجة بالمخزن (طلب توريد خارجي)',
          createdAt: now,
          updatedAt: now
        } as any),
        sparePart: part,
        partNumber,
        partName,
        isCustomNonCatalog: isCustomPart,
        estimatedCost: unitCost,
        quantity,
        priority: partReq.priority || 'HIGH',
        status: 'PENDING',
        reason: partReq.reason || (isCustomPart ? 'طلب توريد وشراء قطعة غيار غير مدرجة بالمخزن' : 'طلب صرف قطعة غيار من المخزن'),
        notes: partReq.notes,
        createdAt: now
      };

      store.partRequests.unshift(newReq);

      // Auto-transition ticket to WAITING_FOR_PART
      tck.status = 'WAITING_FOR_PART';
      if (unitCost > 0) {
        tck.totalPartsCost = (tck.totalPartsCost || 0) + (unitCost * quantity);
      }
      tck.updatedAt = now;

      if (!tck.timeline) tck.timeline = [];
      if (!tck.statusHistory) tck.statusHistory = [];

      tck.statusHistory.push({
        id: `sh-${Date.now()}`,
        ticketId: tck.id,
        previousStatus: prevStatus,
        newStatus: 'WAITING_FOR_PART',
        comment: isCustomPart
          ? `طلب توريد جديد لقطعة غير مسجلة بالمخزن: ${quantity}x ${partName} (${partNumber})`
          : `طلب صرف قطعة من المخزن: ${quantity}x ${partName} (${partNumber})`,
        createdAt: now
      });

      tck.timeline.unshift({
        id: `tl-${Date.now()}`,
        ticketId: tck.id,
        timestamp: now,
        technicianId: tech?.id,
        technicianName: tech?.fullName || tech?.employeeCode,
        technicianCode: tech?.employeeCode,
        action: 'PART_REQUESTED',
        actionLabel: isCustomPart ? 'طلب توريد قطعة جديدة (غير مدرجة)' : 'طلب صرف قطعة من المخزن',
        description: isCustomPart
          ? `تم تقديم طلب شراء وتوريد قطعة غير مدرجة في المخزن: ${quantity}x ${partName} (${partNumber}). تحولت حالة التذكرة إلى في انتظار القطع.`
          : `تم تقديم طلب صرف ${quantity}x من ${partName} (${partNumber}). المخزون المتوفر: ${part?.currentQuantity ?? 0} قطعة.`,
        part: {
          partNumber,
          name: partName,
          quantity,
          unitCost,
          status: 'PENDING'
        }
      });

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'PART_REQUESTED',
        entityName: 'SparePartRequest',
        entityId: newReq.id,
        newValues: {
          ticketNumber: tck.ticketNumber,
          partNumber,
          partName,
          quantity,
          isCustomNonCatalog: isCustomPart
        },
        createdAt: now
      });

      store.save();
      return newReq;
    }
  },

  async resolveTicket(ticketId: string, resolution: {
    technicianId?: string;
    rootCause: string;
    resolutionSummary: string;
    durationMinutes?: number;
    partsUsed?: Array<{ sparePart?: SparePart; partId?: string; quantity: number; unitCostAtUse: number }>;
    comment?: string;
  }) {
    try {
      const updatedTck = await apiFetch<Ticket>(`/tickets/${ticketId}/resolve`, {
        method: 'POST',
        body: JSON.stringify(resolution)
      });
      const idx = store.tickets.findIndex(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (idx !== -1) {
        store.tickets[idx] = updatedTck;
      }
      // Update linked part requests in client store
      const linkedReqs = store.partRequests.filter(
        r => (r.ticketId === ticketId || r.ticketNumber === updatedTck.ticketNumber) && !['ISSUED', 'CANCELLED', 'REJECTED'].includes(r.status)
      );
      const now = new Date().toISOString();
      for (const r of linkedReqs) {
        r.status = 'ISSUED';
        r.issuedAt = now;
        r.issuedBy = updatedTck.assignedTechnician?.fullName || 'Technician';
        r.updatedAt = now;
        if (!r.timeline) r.timeline = [];
        r.timeline.unshift({
          status: 'ISSUED',
          timestamp: now,
          actor: updatedTck.assignedTechnician?.fullName || 'Technician',
          comment: `تم صرف واستخدام القطعة وإتمام الإصلاح بنجاح مع حل البلاغ ${updatedTck.ticketNumber}`
        });
      }
      store.save(false);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
      }
      return updatedTck;
    } catch {
      const tck = store.tickets.find(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (!tck) throw new Error('Ticket not found');

      const tech = store.technicians.find(t => t.id === (resolution.technicianId || tck.assignedTechnicianId)) || store.technicians[0];
      const prevStatus = tck.status;
      const now = new Date().toISOString();

      tck.status = 'RESOLVED';
      tck.resolvedAt = now;
      tck.rootCause = resolution.rootCause;
      tck.resolutionSummary = resolution.resolutionSummary;
      tck.updatedAt = now;

      // Deduct stock for parts used if any & update total parts cost
      if (resolution.partsUsed && resolution.partsUsed.length > 0) {
        let partsCostSum = 0;
        for (const pu of resolution.partsUsed) {
          const part = store.spareParts.find(p => p.id === (pu.partId || pu.sparePart?.id));
          if (part) {
            const qty = pu.quantity || 1;
            const cost = pu.unitCostAtUse || part.unitCost;
            partsCostSum += (qty * cost);

            if (part.currentQuantity < qty) {
              throw new Error(
                `Cannot resolve ticket with part ${part.partNumber}: Insufficient stock (${part.currentQuantity} available, ${qty} requested). Negative inventory is strictly prevented.`
              );
            }

            const balanceBefore = part.currentQuantity;
            const balanceAfter = balanceBefore - qty;
            part.currentQuantity = balanceAfter;
            part.totalValue = balanceAfter * part.unitCost;
            part.updatedAt = now;

            store.transactions.unshift({
              id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              partId: part.id,
              sparePartId: part.id,
              part: part,
              sparePart: part,
              transactionType: 'ISSUE',
              quantity: qty,
              quantityDelta: -qty,
              balanceBefore: balanceBefore,
              balanceAfter: balanceAfter,
              unitCost: cost,
              unitPrice: cost,
              totalCost: qty * cost,
              referenceTicketId: tck.id,
              referenceTicketNumber: tck.ticketNumber,
              referenceNumber: `TCK-${tck.ticketNumber}`,
              machineId: tck.machineId,
              machineNumber: tck.machine?.machineNumber,
              performedBy: tech.fullName || tech.employeeCode,
              notes: `Consumed for corrective repair of ${tck.machine?.machineNumber || 'machine'} under ticket ${tck.ticketNumber}`,
              createdAt: now
            });
          }
        }
        tck.totalPartsCost = (tck.totalPartsCost || 0) + partsCostSum;
      }

      // Automatically fulfill/issue any linked active part requests for this ticket
      const linkedReqs = store.partRequests.filter(
        r => (r.ticketId === tck.id || r.ticketNumber === tck.ticketNumber) && !['ISSUED', 'CANCELLED', 'REJECTED'].includes(r.status)
      );
      for (const r of linkedReqs) {
        r.status = 'ISSUED';
        r.issuedAt = now;
        r.issuedBy = tech.fullName || tech.employeeCode || 'Technician';
        r.updatedAt = now;
        if (!r.timeline) r.timeline = [];
        r.timeline.unshift({
          status: 'ISSUED',
          timestamp: now,
          actor: tech.fullName || 'Technician',
          comment: `تم صرف واستخدام القطعة وإتمام الإصلاح بنجاح مع حل البلاغ ${tck.ticketNumber}`
        });
      }

      if (!tck.maintenanceActions) tck.maintenanceActions = [];
      tck.maintenanceActions.unshift({
        id: `ma-${Date.now()}`,
        ticketId: tck.id,
        technicianId: tech.id,
        technician: tech,
        actionType: 'RESOLUTION_COMPLETED',
        actionTaken: resolution.resolutionSummary,
        description: `Resolved: ${resolution.resolutionSummary}`,
        rootCause: resolution.rootCause,
        durationMinutes: resolution.durationMinutes || 45,
        workDurationMinutes: resolution.durationMinutes || 45,
        partsUsed: resolution.partsUsed,
        performedAt: now,
        createdAt: now
      });

      if (!tck.timeline) tck.timeline = [];
      if (!tck.statusHistory) tck.statusHistory = [];

      tck.statusHistory.push({
        id: `sh-${Date.now()}`,
        ticketId: tck.id,
        previousStatus: prevStatus,
        newStatus: 'RESOLVED',
        comment: resolution.resolutionSummary,
        createdAt: now
      });

      tck.timeline.unshift({
        id: `tl-${Date.now()}`,
        ticketId: tck.id,
        timestamp: now,
        technicianId: tech.id,
        technicianName: tech.fullName || tech.employeeCode,
        technicianCode: tech.employeeCode,
        action: 'RESOLVED',
        actionLabel: 'Ticket Resolved',
        description: `Root Cause: ${resolution.rootCause}. Summary: ${resolution.resolutionSummary}`
      });

      // Update machine status back to OPERATIONAL if no other active critical tickets
      const mch = store.machines.find(m => m.id === tck.machineId);
      if (mch) {
        const remainingActive = store.tickets.filter(t => t.machineId === mch.id && t.id !== tck.id && !['RESOLVED', 'VERIFIED', 'CLOSED'].includes(t.status));
        if (remainingActive.length === 0) {
          mch.status = 'OPERATIONAL';
          mch.lastMaintenanceAt = now;
          mch.healthScore = Math.min(100, (mch.healthScore || 80) + 15);
        }
      }

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'TICKET_RESOLVED',
        entityName: 'Ticket',
        entityId: tck.ticketNumber,
        oldValues: { status: prevStatus },
        newValues: { status: 'RESOLVED', rootCause: resolution.rootCause, resolutionSummary: resolution.resolutionSummary },
        createdAt: now
      });

      store.save();
      return tck;
    }
  },

  async verifyTicket(ticketId: string, verification: { verifiedBy?: string; comment?: string }) {
    try {
      const updatedTck = await apiFetch<Ticket>(`/tickets/${ticketId}/verify`, {
        method: 'POST',
        body: JSON.stringify(verification)
      });
      const idx = store.tickets.findIndex(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (idx !== -1) {
        store.tickets[idx] = updatedTck;
      }
      store.save();
      return updatedTck;
    } catch {
      const tck = store.tickets.find(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (!tck) throw new Error('Ticket not found');

      const prevStatus = tck.status;
      const now = new Date().toISOString();

      tck.status = 'VERIFIED';
      tck.verifiedAt = now;
      tck.updatedAt = now;

      if (!tck.timeline) tck.timeline = [];
      if (!tck.statusHistory) tck.statusHistory = [];

      tck.statusHistory.push({
        id: `sh-${Date.now()}`,
        ticketId: tck.id,
        previousStatus: prevStatus,
        newStatus: 'VERIFIED',
        comment: verification.comment || 'Telemetry and audit verified by QA / Lead',
        createdAt: now
      });

      tck.timeline.unshift({
        id: `tl-${Date.now()}`,
        ticketId: tck.id,
        timestamp: now,
        technicianName: verification.verifiedBy || 'QA Inspector / Ops Lead',
        action: 'VERIFIED',
        actionLabel: 'Repair Verified',
        description: verification.comment || 'Machine test transactions confirmed and operational health criteria satisfied.'
      });

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'TICKET_VERIFIED',
        entityName: 'Ticket',
        entityId: tck.ticketNumber,
        oldValues: { status: prevStatus },
        newValues: { status: 'VERIFIED' },
        createdAt: now
      });

      store.save();
      return tck;
    }
  },

  async closeTicket(ticketId: string, closing: { closedBy?: string; comment?: string }) {
    try {
      const updatedTck = await apiFetch<Ticket>(`/tickets/${ticketId}/close`, {
        method: 'POST',
        body: JSON.stringify(closing)
      });
      const idx = store.tickets.findIndex(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (idx !== -1) {
        store.tickets[idx] = updatedTck;
      }
      store.save();
      return updatedTck;
    } catch {
      const tck = store.tickets.find(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (!tck) throw new Error('Ticket not found');

      const prevStatus = tck.status;
      const now = new Date().toISOString();

      tck.status = 'CLOSED';
      tck.closedAt = now;
      tck.updatedAt = now;

      if (!tck.timeline) tck.timeline = [];
      if (!tck.statusHistory) tck.statusHistory = [];

      tck.statusHistory.push({
        id: `sh-${Date.now()}`,
        ticketId: tck.id,
        previousStatus: prevStatus,
        newStatus: 'CLOSED',
        comment: closing.comment || 'Ticket formally closed and archived',
        createdAt: now
      });

      tck.timeline.unshift({
        id: `tl-${Date.now()}`,
        ticketId: tck.id,
        timestamp: now,
        technicianName: closing.closedBy || 'System Administrator',
        action: 'CLOSED',
        actionLabel: 'Ticket Closed & Archived',
        description: closing.comment || 'All repair steps, parts requisitions, and audit records verified and archived.'
      });

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'TICKET_CLOSED',
        entityName: 'Ticket',
        entityId: tck.ticketNumber,
        oldValues: { status: prevStatus },
        newValues: { status: 'CLOSED' },
        createdAt: now
      });

      store.save();
      return tck;
    }
  },

  async checkTicketReferences(id: string): Promise<{
    canDelete: boolean;
    partRequestsCount: number;
    referenceCounts: Array<{ label: string; count: number }>;
  }> {
    const tck = store.tickets.find(t => t.id === id || t.ticketNumber === id);
    if (!tck) return { canDelete: true, partRequestsCount: 0, referenceCounts: [] };

    const reqs = store.partRequests.filter(r => (r.ticketId === tck.id || r.ticketNumber === tck.ticketNumber) && !r.isDeleted);
    const counts = [
      { label: 'Linked Part Requests', count: reqs.length }
    ];

    return {
      canDelete: reqs.length === 0,
      partRequestsCount: reqs.length,
      referenceCounts: counts
    };
  },

  async updateTicket(ticketId: string, updates: Partial<Ticket>) {
    try {
      const serverUpdated = await apiFetch<Ticket>(`/tickets/${ticketId}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      const idx = store.tickets.findIndex(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (idx !== -1) {
        store.tickets[idx] = { ...store.tickets[idx], ...serverUpdated };
        store.save(false);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
      }
      return serverUpdated;
    } catch {
      const tck = store.tickets.find(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (!tck) throw new Error('Ticket not found');

      const oldValues = {
        priority: tck.priority,
        category: tck.category,
        description: tck.description,
        assignedTechnicianId: tck.assignedTechnicianId
      };

      if (updates.description !== undefined) tck.description = updates.description.trim();
      if (updates.priority !== undefined) tck.priority = updates.priority;
      if (updates.category !== undefined) tck.category = updates.category;
      if (updates.status !== undefined) tck.status = updates.status;
      if (updates.assignedTechnicianId !== undefined) {
        tck.assignedTechnicianId = updates.assignedTechnicianId;
        const tech = store.technicians.find(t => t.id === updates.assignedTechnicianId);
        tck.assignedTechnician = tech;
      }
      tck.updatedAt = new Date().toISOString();

      if (!tck.timeline) tck.timeline = [];
      tck.timeline.unshift({
        id: `tl-${Date.now()}`,
        ticketId: tck.id,
        timestamp: new Date().toISOString(),
        action: 'STATUS_CHANGE',
        actionLabel: 'Ticket Modified',
        description: 'Ticket parameters and details updated.'
      });

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'TICKET_UPDATED',
        entityName: 'Ticket',
        entityId: tck.ticketNumber,
        oldValues,
        newValues: {
          priority: tck.priority,
          category: tck.category,
          assignedTechnicianId: tck.assignedTechnicianId
        },
        createdAt: new Date().toISOString()
      });

      store.save();
      return tck;
    }
  },

  async archiveTicket(ticketId: string, reason?: string) {
    try {
      const updatedTck = await apiFetch<Ticket>(`/tickets/${ticketId}/archive`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
      const idx = store.tickets.findIndex(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (idx !== -1) {
        store.tickets[idx] = updatedTck;
      }
      store.save();
      return updatedTck;
    } catch {
      const tck = store.tickets.find(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (!tck) throw new Error('Ticket not found');

      const now = new Date().toISOString();
      tck.isArchived = true;
      tck.archivedAt = now;
      tck.archivedBy = 'System Admin';
      tck.archivedReason = reason || 'Archived by administrator';
      tck.updatedAt = now;

      if (!tck.timeline) tck.timeline = [];
      tck.timeline.unshift({
        id: `tl-${Date.now()}`,
        ticketId: tck.id,
        timestamp: now,
        action: 'STATUS_CHANGE',
        actionLabel: 'Ticket Archived',
        description: reason || 'Ticket archived from active workflows.'
      });

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'TICKET_ARCHIVED',
        entityName: 'Ticket',
        entityId: tck.ticketNumber,
        newValues: { isArchived: true, reason: tck.archivedReason },
        createdAt: now
      });

      store.save();
      return tck;
    }
  },

  async restoreTicket(ticketId: string) {
    try {
      const updatedTck = await apiFetch<Ticket>(`/tickets/${ticketId}/restore`, {
        method: 'POST'
      });
      const idx = store.tickets.findIndex(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (idx !== -1) {
        store.tickets[idx] = updatedTck;
      }
      store.save();
      return updatedTck;
    } catch {
      const tck = store.tickets.find(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (!tck) throw new Error('Ticket not found');

      const now = new Date().toISOString();
      tck.isArchived = false;
      tck.archivedAt = undefined;
      tck.archivedBy = undefined;
      tck.archivedReason = undefined;
      tck.updatedAt = now;

      if (!tck.timeline) tck.timeline = [];
      tck.timeline.unshift({
        id: `tl-${Date.now()}`,
        ticketId: tck.id,
        timestamp: now,
        action: 'STATUS_CHANGE',
        actionLabel: 'Ticket Restored',
        description: 'Ticket unarchived and restored to active view.'
      });

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'TICKET_RESTORED',
        entityName: 'Ticket',
        entityId: tck.ticketNumber,
        newValues: { isArchived: false },
        createdAt: now
      });

      store.save();
      return tck;
    }
  },

  async deleteTicket(ticketId: string, hardDelete = false, reason?: string) {
    try {
      await apiFetch(`/tickets/${ticketId}?hard=${hardDelete}&reason=${encodeURIComponent(reason || '')}`, {
        method: 'DELETE'
      });
      const tck = store.tickets.find(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (tck) {
        if (hardDelete) {
          const idx = store.tickets.indexOf(tck);
          if (idx !== -1) store.tickets.splice(idx, 1);
        } else {
          tck.isDeleted = true;
          tck.deletedAt = new Date().toISOString();
          tck.deletedBy = 'Super Administrator';
          tck.deletionReason = reason || 'Soft-deleted by Super Admin';
          tck.updatedAt = new Date().toISOString();
        }
        store.save();
      }
      return { success: true, isDeleted: true, deletionReason: tck?.deletionReason, ticket: tck };
    } catch {
      const tck = store.tickets.find(t => t.id === ticketId || t.ticketNumber === ticketId);
      if (!tck) throw new Error('Ticket not found');

      const now = new Date().toISOString();
      if (hardDelete) {
        const idx = store.tickets.indexOf(tck);
        if (idx !== -1) store.tickets.splice(idx, 1);
      } else {
        tck.isDeleted = true;
        tck.deletedAt = now;
        tck.deletedBy = 'Super Administrator';
        tck.deletionReason = reason || 'Soft-deleted by Super Admin';
        tck.updatedAt = now;
      }

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'TICKET_DELETED',
        entityName: 'Ticket',
        entityId: tck.ticketNumber,
        userName: 'Super Administrator',
        newValues: { isDeleted: true, reason: tck.deletionReason },
        timestamp: now,
        createdAt: now
      });

      store.save();
      return { success: true, isDeleted: true, deletionReason: tck.deletionReason, ticket: tck };
    }
  },

  async updateTicketStatus(ticketId: string, status: TicketStatus, comment?: string, rootCause?: string, resolutionSummary?: string) {
    try {
      return await apiFetch<Ticket>(`/tickets/${ticketId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, comment, root_cause: rootCause, resolution_summary: resolutionSummary })
      });
    } catch {
      const tck = store.tickets.find(t => t.id === ticketId);
      if (!tck) throw new Error('Ticket not found');

      const prevStatus = tck.status;
      const now = new Date().toISOString();
      tck.status = status;
      if (rootCause) tck.rootCause = rootCause;
      if (resolutionSummary) tck.resolutionSummary = resolutionSummary;
      if (status === 'IN_PROGRESS' && !tck.startedAt) tck.startedAt = now;
      if (status === 'RESOLVED' && !tck.resolvedAt) tck.resolvedAt = now;
      if (status === 'VERIFIED' && !tck.verifiedAt) tck.verifiedAt = now;
      if (status === 'CLOSED' && !tck.closedAt) tck.closedAt = now;
      tck.updatedAt = now;

      if (!tck.timeline) tck.timeline = [];
      if (!tck.statusHistory) tck.statusHistory = [];

      tck.statusHistory.push({
        id: `sh-${Date.now()}`,
        ticketId: tck.id,
        previousStatus: prevStatus,
        newStatus: status,
        comment: comment || `Status updated to ${status}`,
        createdAt: now
      });

      tck.timeline.unshift({
        id: `tl-${Date.now()}`,
        ticketId: tck.id,
        timestamp: now,
        action: 'STATUS_CHANGE',
        actionLabel: `Status changed to ${status}`,
        description: comment || `Workflow transition from ${prevStatus} to ${status}`
      });

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'TICKET_STATUS_CHANGED',
        entityName: 'Ticket',
        entityId: tck.ticketNumber,
        oldValues: { status: prevStatus },
        newValues: { status, rootCause, resolutionSummary },
        createdAt: now
      });

      store.save();
      return tck;
    }
  },

  async calculateTechnicianKPIs(technicianId: string): Promise<TechnicianKPIs> {
    const tech = store.technicians.find(t => t.id === technicianId);
    const techTickets = store.tickets.filter(t => t.assignedTechnicianId === technicianId);
    
    const completed = techTickets.filter(t => ['RESOLVED', 'VERIFIED', 'CLOSED'].includes(t.status));
    const active = techTickets.filter(t => !['RESOLVED', 'VERIFIED', 'CLOSED', 'CANCELLED'].includes(t.status));
    
    // SLA compliance
    let onTimeCount = 0;
    completed.forEach(t => {
      if (t.slaDueAt && t.resolvedAt) {
        if (new Date(t.resolvedAt).getTime() <= new Date(t.slaDueAt).getTime()) {
          onTimeCount++;
        }
      } else {
        onTimeCount++;
      }
    });
    const slaRate = completed.length > 0 ? (onTimeCount / completed.length) * 100 : (tech?.kpis?.slaComplianceRate || 95.0);

    // First time fix rate
    const recurringCount = completed.filter(t => t.isRecurring).length;
    const ftfRate = completed.length > 0 ? ((completed.length - recurringCount) / completed.length) * 100 : (tech?.kpis?.firstTimeFixRate || 92.0);

    // Mean response time in minutes
    let responseMinutesSum = 0;
    let responseSamples = 0;
    techTickets.forEach(t => {
      if (t.acknowledgedAt && t.createdAt) {
        const diffMs = new Date(t.acknowledgedAt).getTime() - new Date(t.createdAt).getTime();
        responseMinutesSum += Math.max(1, Math.round(diffMs / 60000));
        responseSamples++;
      }
    });
    const avgResponse = responseSamples > 0 ? Math.round((responseMinutesSum / responseSamples) * 10) / 10 : (tech?.kpis?.responseTimeMinutes || 15.0);

    // Mean repair time (started to resolved) in minutes
    let repairMinutesSum = 0;
    let repairSamples = 0;
    completed.forEach(t => {
      if (t.startedAt && t.resolvedAt) {
        const diffMs = new Date(t.resolvedAt).getTime() - new Date(t.startedAt).getTime();
        repairMinutesSum += Math.max(5, Math.round(diffMs / 60000));
        repairSamples++;
      }
    });
    const avgRepair = repairSamples > 0 ? Math.round((repairMinutesSum / repairSamples) * 10) / 10 : (tech?.kpis?.repairTimeMinutes || 35.0);

    const partsReplaced = store.partRequests.filter(r => r.technicianId === technicianId && r.status === 'ISSUED').length;

    const kpiResult: TechnicianKPIs = {
      technicianId,
      responseTimeMinutes: avgResponse,
      repairTimeMinutes: avgRepair,
      completedTickets: (tech?.kpis?.completedTickets || 0) + completed.length,
      firstTimeFixRate: Math.round(ftfRate * 10) / 10,
      slaComplianceRate: Math.round(slaRate * 10) / 10,
      activeTicketsCount: active.length,
      totalLaborMinutes: Math.round(repairMinutesSum + (completed.length * 35)),
      partsReplacedCount: partsReplaced + (tech?.kpis?.partsReplacedCount || 8),
      rating: tech?.kpis?.rating || 4.9
    };

    if (tech) {
      tech.kpis = kpiResult;
    }

    return kpiResult;
  },

  // Technicians
  async getTechnicians(includeInactive = true) {
    try {
      const res = await apiFetch<Technician[]>(includeInactive ? '/technicians?include_inactive=true' : '/technicians');
      return res;
    } catch {
      // Refresh KPIs for all technicians
      store.technicians.forEach(t => {
        const techTickets = store.tickets.filter(tk => tk.assignedTechnicianId === t.id && !tk.isDeleted);
        const active = techTickets.filter(tk => !['RESOLVED', 'VERIFIED', 'CLOSED'].includes(tk.status));
        if (t.kpis) {
          t.kpis.activeTicketsCount = active.length;
        }
      });
      return includeInactive ? store.technicians.filter(t => !t.isDeleted) : store.technicians.filter(t => t.isActive !== false && !t.isDeleted);
    }
  },

  async getTechnicianById(id: string) {
    try {
      return await apiFetch<Technician>(`/technicians/${id}`);
    } catch {
      const tech = store.technicians.find(t => t.id === id || t.employeeCode === id) || null;
      if (tech) {
        tech.assignedTickets = store.tickets.filter(t => t.assignedTechnicianId === tech.id && !t.isDeleted);
      }
      return tech;
    }
  },

  async checkTechnicianReferences(id: string): Promise<{
    canDelete: boolean;
    activeTicketsCount: number;
    referenceCounts: Array<{ label: string; count: number }>;
  }> {
    try {
      return await apiFetch<{ canDelete: boolean; activeTicketsCount: number; referenceCounts: Array<{ label: string; count: number }> }>(`/technicians/${id}/references`);
    } catch {
      const tech = store.technicians.find(t => t.id === id || t.employeeCode === id);
      if (!tech) return { canDelete: true, activeTicketsCount: 0, referenceCounts: [] };

      const activeTickets = store.tickets.filter(
        t => t.assignedTechnicianId === tech.id && !['RESOLVED', 'VERIFIED', 'CLOSED', 'CANCELLED'].includes(t.status) && !t.isDeleted
      );
      const allTickets = store.tickets.filter(t => t.assignedTechnicianId === tech.id && !t.isDeleted);
      const requests = store.partRequests.filter(r => r.technicianId === tech.id && !r.isDeleted);

      const counts = [
        { label: 'Active Assigned Tickets', count: activeTickets.length },
        { label: 'Total Historical Tickets', count: allTickets.length },
        { label: 'Spare Part Requisitions', count: requests.length }
      ];

      return {
        canDelete: activeTickets.length === 0 && allTickets.length === 0,
        activeTicketsCount: activeTickets.length,
        referenceCounts: counts
      };
    }
  },

  async createTechnician(tech: Partial<Technician>) {
    try {
      const created = await apiFetch<Technician>('/technicians', {
        method: 'POST',
        body: JSON.stringify(tech)
      });
      // Sync local in-memory store
      const existingIdx = store.technicians.findIndex(t => t.id === created.id || t.employeeCode === created.employeeCode);
      if (existingIdx >= 0) {
        store.technicians[existingIdx] = created;
      } else {
        store.technicians.push(created);
      }
      return created;
    } catch (err: any) {
      const newTech: Technician = {
        id: `tch-${Date.now()}`,
        userId: tech.userId || `usr-tech-${Date.now()}`,
        fullName: tech.fullName || 'New Technician',
        fullNameAr: tech.fullNameAr || tech.fullName,
        email: tech.email || `${(tech.employeeCode || 'tech').toLowerCase()}@company.com`,
        phone: tech.phoneNumber || tech.phone || '+966 50 000 0000',
        phoneNumber: tech.phoneNumber || tech.phone || '+966 50 000 0000',
        employeeCode: (tech.employeeCode || `TECH-${Math.floor(1000 + Math.random() * 9000)}`).trim().toUpperCase(),
        specialization: tech.specialization || 'General Maintenance',
        status: tech.status || 'AVAILABLE',
        skills: tech.skills || ['General Vending Maintenance'],
        assignedRegion: tech.assignedRegion || 'Central Campus',
        maxDailyCapacity: tech.maxDailyCapacity || tech.maxActiveTickets || 5,
        maxActiveTickets: tech.maxActiveTickets || tech.maxDailyCapacity || 5,
        isActive: true,
        isDeleted: false,
        createdAt: new Date().toISOString()
      };
      store.technicians.push(newTech);

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'TECHNICIAN_CREATED',
        entityName: 'Technician',
        entityId: newTech.employeeCode,
        newValues: { fullName: newTech.fullName, specialization: newTech.specialization },
        createdAt: new Date().toISOString()
      });

      return newTech;
    }
  },

  async updateTechnician(id: string, updates: Partial<Technician>) {
    try {
      const updated = await apiFetch<Technician>(`/technicians/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      const idx = store.technicians.findIndex(t => t.id === id || t.employeeCode === id);
      if (idx !== -1) store.technicians[idx] = updated;
      return updated;
    } catch {
      const tech = store.technicians.find(t => t.id === id || t.employeeCode === id);
      if (!tech) throw new Error('Technician not found');

      const oldValues = {
        fullName: tech.fullName,
        email: tech.email,
        phone: tech.phoneNumber || tech.phone,
        specialization: tech.specialization,
        status: tech.status,
        maxActiveTickets: tech.maxActiveTickets
      };

      if (updates.fullName !== undefined) tech.fullName = updates.fullName.trim();
      if (updates.fullNameAr !== undefined) tech.fullNameAr = updates.fullNameAr.trim();
      if (updates.email !== undefined) tech.email = updates.email.trim();
      if (updates.phoneNumber !== undefined || updates.phone !== undefined) {
        tech.phone = (updates.phoneNumber || updates.phone || '').trim();
        tech.phoneNumber = (updates.phoneNumber || updates.phone || '').trim();
      }
      if (updates.specialization !== undefined) tech.specialization = updates.specialization;
      if (updates.status !== undefined) tech.status = updates.status;
      if (updates.skills !== undefined) tech.skills = updates.skills;
      if (updates.assignedRegion !== undefined) tech.assignedRegion = updates.assignedRegion;
      if (updates.maxDailyCapacity !== undefined || updates.maxActiveTickets !== undefined) {
        const cap = Number(updates.maxDailyCapacity || updates.maxActiveTickets || 5);
        tech.maxDailyCapacity = cap;
        tech.maxActiveTickets = cap;
      }
      if (updates.isActive !== undefined) tech.isActive = updates.isActive;
      tech.updatedAt = new Date().toISOString();

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'TECHNICIAN_UPDATED',
        entityName: 'Technician',
        entityId: tech.employeeCode,
        oldValues,
        newValues: {
          fullName: tech.fullName,
          specialization: tech.specialization,
          status: tech.status,
          isActive: tech.isActive
        },
        createdAt: new Date().toISOString()
      });

      return tech;
    }
  },

  async deactivateTechnician(id: string, reason?: string) {
    try {
      const res = await apiFetch<Technician>(`/technicians/${id}/deactivate`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
      const idx = store.technicians.findIndex(t => t.id === id || t.employeeCode === id);
      if (idx !== -1) store.technicians[idx] = res;
      return res;
    } catch (err: any) {
      const tech = store.technicians.find(t => t.id === id || t.employeeCode === id);
      if (!tech) throw new Error('Technician not found');

      const activeTickets = store.tickets.filter(
        t => t.assignedTechnicianId === tech.id && !['RESOLVED', 'VERIFIED', 'CLOSED', 'CANCELLED'].includes(t.status) && !t.isDeleted
      );
      if (activeTickets.length > 0) {
        throw new Error(`Cannot deactivate technician ${tech.fullName || tech.employeeCode} because they have ${activeTickets.length} active ticket(s) assigned. Please reassign their tickets first.`);
      }

      tech.isActive = false;
      tech.status = 'ON_LEAVE';
      tech.deactivatedAt = new Date().toISOString();
      tech.deactivatedBy = 'System Admin';
      tech.deactivationReason = reason || 'Staff deactivation';
      tech.updatedAt = new Date().toISOString();

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'TECHNICIAN_DEACTIVATED',
        entityName: 'Technician',
        entityId: tech.employeeCode,
        newValues: { isActive: false, reason: tech.deactivationReason },
        createdAt: new Date().toISOString()
      });

      return tech;
    }
  },

  async reactivateTechnician(id: string) {
    try {
      const res = await apiFetch<Technician>(`/technicians/${id}/reactivate`, {
        method: 'POST'
      });
      const idx = store.technicians.findIndex(t => t.id === id || t.employeeCode === id);
      if (idx !== -1) store.technicians[idx] = res;
      return res;
    } catch {
      const tech = store.technicians.find(t => t.id === id || t.employeeCode === id);
      if (!tech) throw new Error('Technician not found');

      tech.isActive = true;
      tech.status = 'AVAILABLE';
      tech.deactivatedAt = undefined;
      tech.deactivatedBy = undefined;
      tech.deactivationReason = undefined;
      tech.updatedAt = new Date().toISOString();

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'TECHNICIAN_REACTIVATED',
        entityName: 'Technician',
        entityId: tech.employeeCode,
        newValues: { isActive: true },
        createdAt: new Date().toISOString()
      });

      return tech;
    }
  },

  async deleteTechnician(id: string, hardDelete = false, reason?: string) {
    try {
      await apiFetch(`/technicians/${id}?hard=${hardDelete}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason })
      });
      const idx = store.technicians.findIndex(t => t.id === id || t.employeeCode === id);
      if (idx !== -1) {
        if (hardDelete) {
          store.technicians.splice(idx, 1);
        } else {
          store.technicians[idx].isDeleted = true;
          store.technicians[idx].isActive = false;
          store.technicians[idx].status = 'INACTIVE';
        }
      }
      store.save();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
      }
      return { success: true };
    } catch (err: any) {
      const tech = store.technicians.find(t => t.id === id || t.employeeCode === id);
      if (!tech) throw new Error('Technician not found');

      const refs = await this.checkTechnicianReferences(tech.id);
      if (hardDelete && !refs.canDelete) {
        throw new Error(
          `Cannot permanently delete technician "${tech.fullName || tech.employeeCode}" because they are linked to tickets or part requisitions. Please deactivate them instead.`
        );
      }

      if (hardDelete) {
        const idx = store.technicians.findIndex(t => t.id === tech.id);
        if (idx !== -1) store.technicians.splice(idx, 1);

        store.auditLogs.unshift({
          id: `aud-${Date.now()}`,
          action: 'TECHNICIAN_PURGED',
          entityName: 'Technician',
          entityId: tech.employeeCode,
          newValues: { reason: reason || 'Hard delete' },
          createdAt: new Date().toISOString()
        });
      } else {
        tech.isDeleted = true;
        tech.isActive = false;
        tech.status = 'INACTIVE';
        tech.deletedAt = new Date().toISOString();
        tech.deletedBy = 'System Admin';
        tech.deletionReason = reason || 'Soft deleted';
        tech.updatedAt = new Date().toISOString();

        store.auditLogs.unshift({
          id: `aud-${Date.now()}`,
          action: 'TECHNICIAN_DELETED',
          entityName: 'Technician',
          entityId: tech.employeeCode,
          newValues: { isDeleted: true, reason: tech.deletionReason },
          createdAt: new Date().toISOString()
        });
      }

      store.save();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
      }
      return { success: true };
    }
  },

  // Spare Parts & Inventory
  async getSpareParts(includeInactive = true) {
    try {
      const res = await apiFetch<any>(includeInactive ? '/spare-parts?include_inactive=true' : '/spare-parts');
      const items = res.items || res;
      return items.map((p: SparePart) => ({
        ...p,
        totalValue: (p.currentQuantity || 0) * (p.unitCost || 0)
      }));
    } catch {
      let parts = store.spareParts.filter(p => !p.isDeleted);
      if (!includeInactive) {
        parts = parts.filter(p => p.isActive !== false);
      }
      return parts.map(p => {
        const cat = typeof p.category === 'object' ? p.category : store.categories.find(c => c.id === p.categoryId || c.name === p.category);
        const sup = p.supplierId ? store.suppliers.find(s => s.id === p.supplierId) : undefined;
        return {
          ...p,
          category: cat || p.category,
          supplier: sup,
          totalValue: (p.currentQuantity || 0) * (p.unitCost || 0)
        };
      });
    }
  },

  async checkSparePartReferences(id: string): Promise<{
    canDelete: boolean;
    referenceCounts: Array<{ label: string; count: number }>;
  }> {
    try {
      return await apiFetch<{ canDelete: boolean; referenceCounts: Array<{ label: string; count: number }> }>(`/spare-parts/${id}/references`);
    } catch {
      const part = store.spareParts.find(p => p.id === id || p.partNumber === id);
      if (!part) return { canDelete: true, referenceCounts: [] };

      const transactions = store.transactions.filter(t => t.partId === part.id || t.sparePartId === part.id);
      const requests = store.partRequests.filter(r => (r.partId === part.id || r.sparePartId === part.id) && !r.isDeleted);

      const counts = [
        { label: 'Current Inventory Units', count: part.currentQuantity || 0 },
        { label: 'Inventory Movements', count: transactions.length },
        { label: 'Part Requisitions', count: requests.length }
      ];

      const hasStockOrHistory = (part.currentQuantity || 0) > 0 || transactions.length > 0 || requests.length > 0;
      return {
        canDelete: !hasStockOrHistory,
        referenceCounts: counts
      };
    }
  },

  async deactivateSparePart(id: string, reason?: string) {
    try {
      return await apiFetch<SparePart>(`/spare-parts/${id}/deactivate`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
    } catch {
      const part = store.spareParts.find(p => p.id === id || p.partNumber === id);
      if (!part) throw new Error('Spare part not found');

      part.isActive = false;
      part.deactivatedAt = new Date().toISOString();
      part.deactivatedBy = 'System Admin';
      part.deactivationReason = reason || 'Discontinued / Inactive SKU';
      part.updatedAt = new Date().toISOString();

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'SPARE_PART_DEACTIVATED',
        entityName: 'SparePart',
        entityId: part.partNumber,
        newValues: { isActive: false, reason: part.deactivationReason },
        createdAt: new Date().toISOString()
      });

      return part;
    }
  },

  async reactivateSparePart(id: string) {
    try {
      return await apiFetch<SparePart>(`/spare-parts/${id}/reactivate`, {
        method: 'POST'
      });
    } catch {
      const part = store.spareParts.find(p => p.id === id || p.partNumber === id);
      if (!part) throw new Error('Spare part not found');

      part.isActive = true;
      part.deactivatedAt = undefined;
      part.deactivatedBy = undefined;
      part.deactivationReason = undefined;
      part.updatedAt = new Date().toISOString();

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'SPARE_PART_REACTIVATED',
        entityName: 'SparePart',
        entityId: part.partNumber,
        newValues: { isActive: true },
        createdAt: new Date().toISOString()
      });

      return part;
    }
  },

  async getSparePartById(id: string) {
    try {
      return await apiFetch<SparePart>(`/spare-parts/${id}`);
    } catch {
      const part = store.spareParts.find(p => p.id === id || p.partNumber === id);
      if (!part) return null;
      const cat = typeof part.category === 'object' ? part.category : store.categories.find(c => c.id === part.categoryId || c.name === part.category);
      const sup = part.supplierId ? store.suppliers.find(s => s.id === part.supplierId) : undefined;
      return {
        ...part,
        category: cat || part.category,
        supplier: sup,
        totalValue: (part.currentQuantity || 0) * (part.unitCost || 0)
      };
    }
  },

  async getSparePartCategories() {
    try {
      return await apiFetch<SparePartCategory[]>('/spare-parts/categories');
    } catch {
      return store.categories.map(c => {
        const matchingParts = store.spareParts.filter(p => p.categoryId === c.id || (typeof p.category === 'string' && p.category === c.name));
        const partsCount = matchingParts.length;
        const totalValue = matchingParts.reduce((sum, p) => sum + (p.currentQuantity * p.unitCost), 0);
        return {
          ...c,
          partsCount,
          totalValue
        };
      });
    }
  },

  async createSparePartCategory(cat: Partial<SparePartCategory>) {
    try {
      return await apiFetch<SparePartCategory>('/spare-categories', {
        method: 'POST',
        body: JSON.stringify(cat)
      });
    } catch {
      const newCat: SparePartCategory = {
        id: `cat-${Date.now()}`,
        name: cat.name || 'New Category',
        nameAr: cat.nameAr,
        description: cat.description,
        partsCount: 0,
        totalValue: 0
      };
      store.categories.push(newCat);
      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'CATEGORY_CREATED',
        entityName: 'SparePartCategory',
        entityId: newCat.id,
        newValues: { name: newCat.name },
        createdAt: new Date().toISOString()
      });
      return newCat;
    }
  },

  async updateSparePartCategory(id: string, cat: Partial<SparePartCategory>) {
    try {
      return await apiFetch<SparePartCategory>(`/spare-categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(cat)
      });
    } catch {
      const existing = store.categories.find(c => c.id === id);
      if (!existing) throw new Error('Category not found');
      Object.assign(existing, cat);
      return existing;
    }
  },

  async deleteSparePartCategory(id: string) {
    try {
      return await apiFetch<{ success: boolean }>(`/spare-categories/${id}`, {
        method: 'DELETE'
      });
    } catch {
      const idx = store.categories.findIndex(c => c.id === id);
      if (idx !== -1) {
        store.categories.splice(idx, 1);
      }
      return { success: true };
    }
  },

  async createSparePart(part: Partial<SparePart>) {
    try {
      return await apiFetch<SparePart>('/spare-parts', {
        method: 'POST',
        body: JSON.stringify(part)
      });
    } catch {
      const existingSku = store.spareParts.find(p => p.partNumber.toLowerCase() === (part.partNumber || '').trim().toLowerCase());
      if (existingSku) {
        throw new Error(`Spare part SKU ${part.partNumber} already exists in catalog.`);
      }

      const initialQty = Math.max(0, part.currentQuantity || 0);
      const unitCost = Math.max(0, part.unitCost || 0);
      const minStock = part.minStockLevel ?? part.minimumQuantity ?? 5;
      const maxStock = part.maxStockLevel ?? Math.max(minStock * 4, 30);
      const cat = store.categories.find(c => c.id === part.categoryId) || store.categories[0];
      const sup = part.supplierId ? store.suppliers.find(s => s.id === part.supplierId) : undefined;

      const newPart: SparePart = {
        id: `prt-${Date.now()}`,
        partNumber: (part.partNumber || `SP-${Date.now().toString().slice(-6)}`).trim().toUpperCase(),
        name: part.name || 'New Spare Part',
        nameAr: part.nameAr,
        categoryId: cat.id,
        category: cat,
        supplierId: sup?.id,
        supplier: sup,
        manufacturer: part.manufacturer || sup?.name || 'OEM',
        compatibleModels: part.compatibleModels || ['RoboVendor Pro 500', 'BaristaTouch', 'HydroPure'],
        unit: part.unit || 'PCS',
        currentQuantity: initialQty,
        minStockLevel: minStock,
        minimumQuantity: minStock,
        maxStockLevel: maxStock,
        unitCost: unitCost,
        totalValue: initialQty * unitCost,
        storageLocation: part.storageLocation || 'Central Warehouse Bin A-01',
        leadTimeDays: part.leadTimeDays || sup?.leadTimeDays || 3,
        isActive: true,
        createdAt: new Date().toISOString()
      };

      store.spareParts.unshift(newPart);

      // If initial quantity > 0, automatically post an audited RECEIVE transaction
      if (initialQty > 0) {
        const now = new Date().toISOString();
        store.transactions.unshift({
          id: `tx-${Date.now()}`,
          partId: newPart.id,
          sparePartId: newPart.id,
          part: newPart,
          sparePart: newPart,
          transactionType: 'RECEIVE',
          quantity: initialQty,
          quantityDelta: initialQty,
          balanceBefore: 0,
          balanceAfter: initialQty,
          unitCost: unitCost,
          unitPrice: unitCost,
          totalCost: initialQty * unitCost,
          performedBy: 'Warehouse Inventory Lead',
          referenceNumber: 'INITIAL-STOCK-SETUP',
          notes: `Initial baseline stock receipt for new catalog SKU ${newPart.partNumber}`,
          createdAt: now
        });
      }

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'SPARE_PART_CREATED',
        entityName: 'SparePart',
        entityId: newPart.partNumber,
        newValues: { name: newPart.name, initialQty, unitCost },
        createdAt: new Date().toISOString()
      });

      return newPart;
    }
  },

  async updateSparePart(id: string, updates: Partial<SparePart>) {
    try {
      return await apiFetch<SparePart>(`/spare-parts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
    } catch {
      const part = store.spareParts.find(p => p.id === id || p.partNumber === id);
      if (!part) throw new Error('Spare part not found');

      const oldValues = { ...part };
      if (updates.name !== undefined) part.name = updates.name;
      if (updates.nameAr !== undefined) part.nameAr = updates.nameAr;
      if (updates.unitCost !== undefined) part.unitCost = Number(updates.unitCost);
      if (updates.minStockLevel !== undefined) {
        part.minStockLevel = Number(updates.minStockLevel);
        part.minimumQuantity = Number(updates.minStockLevel);
      }
      if (updates.maxStockLevel !== undefined) part.maxStockLevel = Number(updates.maxStockLevel);
      if (updates.storageLocation !== undefined) part.storageLocation = updates.storageLocation;
      if (updates.manufacturer !== undefined) part.manufacturer = updates.manufacturer;
      if (updates.supplierId !== undefined) {
        part.supplierId = updates.supplierId;
        part.supplier = store.suppliers.find(s => s.id === updates.supplierId);
      }
      if (updates.categoryId !== undefined) {
        part.categoryId = updates.categoryId;
        part.category = store.categories.find(c => c.id === updates.categoryId);
      }
      if (updates.compatibleModels !== undefined) part.compatibleModels = updates.compatibleModels;
      if (updates.leadTimeDays !== undefined) part.leadTimeDays = Number(updates.leadTimeDays);

      part.totalValue = part.currentQuantity * part.unitCost;
      part.updatedAt = new Date().toISOString();

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'SPARE_PART_UPDATED',
        entityName: 'SparePart',
        entityId: part.partNumber,
        oldValues: { unitCost: oldValues.unitCost, minStock: oldValues.minStockLevel },
        newValues: { unitCost: part.unitCost, minStock: part.minStockLevel },
        createdAt: new Date().toISOString()
      });

      return part;
    }
  },

  async deleteSparePart(id: string, hardDelete = true, reason?: string) {
    try {
      const res = await apiFetch<any>(`/spare-parts/${id}?hardDelete=${hardDelete}&force=true`, {
        method: 'DELETE',
        body: JSON.stringify({ reason, hardDelete })
      });
      // Synchronously purge from client-side memory store
      if (hardDelete) {
        store.spareParts = store.spareParts.filter(p => p.id !== id && p.partNumber !== id);
      } else {
        const found = store.spareParts.find(p => p.id === id || p.partNumber === id);
        if (found) {
          found.isDeleted = true;
          found.isActive = false;
        }
      }
      store.save();
      return res;
    } catch {
      const part = store.spareParts.find(p => p.id === id || p.partNumber === id);
      if (!part) throw new Error('Spare part not found');

      if (hardDelete) {
        store.spareParts = store.spareParts.filter(p => p.id !== part.id && p.partNumber !== part.partNumber);
        store.save();

        store.auditLogs.unshift({
          id: `aud-${Date.now()}`,
          action: 'SPARE_PART_PURGED',
          entityName: 'SparePart',
          entityId: part.partNumber,
          newValues: { reason: reason || 'Hard delete' },
          createdAt: new Date().toISOString()
        });
      } else {
        part.isDeleted = true;
        part.isActive = false;
        part.deletedAt = new Date().toISOString();
        part.deletedBy = 'System Admin';
        part.deletionReason = reason || 'Soft deleted SKU';
        part.updatedAt = new Date().toISOString();

        store.auditLogs.unshift({
          id: `aud-${Date.now()}`,
          action: 'SPARE_PART_DELETED',
          entityName: 'SparePart',
          entityId: part.partNumber,
          newValues: { isDeleted: true, reason: part.deletionReason },
          createdAt: new Date().toISOString()
        });
      }

      return { success: true };
    }
  },

  async purgeAllDemoData() {
    try {
      await apiFetch('/system/purge-demo-data', { method: 'POST' });
    } catch {}
    store.machines = [];
    store.tickets = [];
    store.buildings = [];
    store.floors = [];
    store.locations = [];
    store.technicians = [];
    store.spareParts = [];
    store.suppliers = [];
    store.partRequests = [];
    store.transactions = [];
    store.importBatches = [];
    store.importRows = [];
    store.auditLogs = [];
    store.save();
    return { success: true };
  },

  async getInventoryTransactions(filter?: { partId?: string; type?: string; ticketId?: string; machineId?: string }) {
    try {
      const params = new URLSearchParams();
      if (filter?.partId) params.append('partId', filter.partId);
      if (filter?.type) params.append('type', filter.type);
      if (filter?.ticketId) params.append('ticketId', filter.ticketId);
      if (filter?.machineId) params.append('machineId', filter.machineId);
      const queryStr = params.toString() ? `?${params.toString()}` : '';

      const res = await apiFetch<any>(`/inventory/transactions${queryStr}`);
      return res.items || res;
    } catch {
      let result = [...store.transactions];
      if (filter?.partId) {
        result = result.filter(tx => tx.partId === filter.partId || tx.sparePartId === filter.partId);
      }
      if (filter?.type) {
        result = result.filter(tx => tx.transactionType === filter.type);
      }
      if (filter?.ticketId) {
        result = result.filter(tx => tx.referenceTicketId === filter.ticketId || tx.referenceTicketNumber === filter.ticketId);
      }
      if (filter?.machineId) {
        result = result.filter(tx => tx.machineId === filter.machineId || tx.machineNumber === filter.machineId);
      }
      return result;
    }
  },

  /**
   * Core Auditable Stock Adjustment Engine
   * Strictly enforces PREVENT NEGATIVE INVENTORY on all outbound movements
   * Supports: RECEIVE, ISSUE, RETURN, ADJUSTMENT, TRANSFER, SCRAP
   */
  async postStockAdjustment(adj: {
    part_id?: string;
    sparePartId?: string;
    transaction_type: InventoryTransactionType;
    quantity_delta?: number;
    quantity?: number;
    unitCost?: number;
    referenceTicketId?: string;
    referenceTicketNumber?: string;
    referenceNumber?: string;
    machineId?: string;
    machineNumber?: string;
    sourceLocation?: string;
    targetLocation?: string;
    performedBy?: string;
    notes?: string;
  }) {
    try {
      return await apiFetch<InventoryTransaction>('/inventory/adjust', {
        method: 'POST',
        body: JSON.stringify(adj)
      });
    } catch {
      const targetId = adj.part_id || adj.sparePartId || (store.spareParts?.[0]?.id);
      let part = targetId ? store.spareParts.find(p => p.id === targetId || p.partNumber === targetId) : undefined;
      if (!part) {
        // Auto-register so movement doesn't fail
        part = {
          id: targetId || `sp-${Date.now()}`,
          partNumber: `SKU-${Date.now().toString().slice(-6)}`,
          name: 'Spare Part Item',
          nameAr: 'قطعة غيار',
          category: 'GENERAL',
          unitCost: adj.unitCost || 50,
          currentQuantity: 0,
          minimumQuantity: 2,
          reorderPoint: 2,
          reorderQuantity: 5,
          storageLocation: adj.sourceLocation || 'Central Warehouse',
          status: 'ACTIVE',
          isActive: true,
          totalValue: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        store.spareParts.unshift(part);
      }

      const type = adj.transaction_type;
      const rawQty = Math.abs(adj.quantity ?? (adj.quantity_delta !== undefined ? Math.abs(adj.quantity_delta) : 1));

      let delta = 0;
      if (type === 'RECEIVE' || type === 'RETURN') {
        delta = rawQty;
      } else if (type === 'ISSUE' || type === 'SCRAP' || type === 'TRANSFER') {
        delta = -rawQty;
      } else if (type === 'ADJUSTMENT') {
        delta = adj.quantity_delta !== undefined ? adj.quantity_delta : (adj.quantity !== undefined ? adj.quantity : rawQty);
      }

      const balanceBefore = part.currentQuantity;
      const balanceAfter = balanceBefore + delta;

      // STRICT CHECK: PREVENT NEGATIVE INVENTORY
      if (balanceAfter < 0) {
        throw new Error(
          `Insufficient stock available for SKU ${part.partNumber} (${part.name}). ` +
          `Current available stock is ${balanceBefore} units, but requested transaction requires deducting ${Math.abs(delta)} units. ` +
          `Negative inventory is strictly prevented. Please file a Spare Part Request to replenish stock.`
        );
      }

      // Update part state
      part.currentQuantity = balanceAfter;
      part.totalValue = balanceAfter * part.unitCost;
      part.updatedAt = new Date().toISOString();

      const costPerUnit = adj.unitCost !== undefined ? adj.unitCost : part.unitCost;
      const totalMovementCost = Math.abs(delta) * costPerUnit;
      const now = new Date().toISOString();

      let refTicketNum = adj.referenceTicketNumber;
      if (!refTicketNum && adj.referenceTicketId) {
        const tck = store.tickets.find(t => t.id === adj.referenceTicketId || t.ticketNumber === adj.referenceTicketId);
        if (tck) refTicketNum = tck.ticketNumber;
      }

      let refMachNum = adj.machineNumber;
      if (!refMachNum && adj.machineId) {
        const mch = store.machines.find(m => m.id === adj.machineId || m.machineNumber === adj.machineId);
        if (mch) refMachNum = mch.machineNumber;
      }

      const tx: InventoryTransaction = {
        id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        partId: part.id,
        sparePartId: part.id,
        part: part,
        sparePart: part,
        transactionType: type,
        quantity: Math.abs(delta),
        quantityDelta: delta,
        balanceBefore: balanceBefore,
        balanceAfter: balanceAfter,
        unitCost: costPerUnit,
        unitPrice: costPerUnit,
        totalCost: totalMovementCost,
        referenceTicketId: adj.referenceTicketId,
        referenceTicketNumber: refTicketNum,
        referenceNumber: adj.referenceNumber || (refTicketNum ? `TCK-${refTicketNum}` : `MOV-${Date.now().toString().slice(-6)}`),
        machineId: adj.machineId,
        machineNumber: refMachNum,
        sourceLocation: adj.sourceLocation || part.storageLocation,
        targetLocation: adj.targetLocation,
        performedBy: adj.performedBy || 'Warehouse Officer',
        notes: adj.notes || `${type} movement of ${Math.abs(delta)} units`,
        createdAt: now
      };

      store.transactions.unshift(tx);

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: `INVENTORY_${type}`,
        entityName: 'InventoryTransaction',
        entityId: tx.id,
        newValues: {
          partNumber: part.partNumber,
          type,
          delta,
          balanceBefore,
          balanceAfter,
          reference: tx.referenceNumber,
          notes: tx.notes
        },
        createdAt: now
      });

      return tx;
    }
  },

  async adjustInventory(payload: {
    sparePartId?: string;
    partId?: string;
    transactionType: InventoryTransactionType;
    quantity: number;
    quantityDelta?: number;
    unitCost?: number;
    referenceNumber?: string;
    referenceTicketId?: string;
    machineId?: string;
    sourceLocation?: string;
    targetLocation?: string;
    performedBy?: string;
    notes?: string;
  }) {
    const partId = payload.sparePartId || payload.partId || store.spareParts[0].id;
    return await this.postStockAdjustment({
      part_id: partId,
      sparePartId: partId,
      transaction_type: payload.transactionType,
      quantity: payload.quantity,
      quantity_delta: payload.quantityDelta !== undefined ? payload.quantityDelta : (payload.transactionType === 'ADJUSTMENT' ? payload.quantity : undefined),
      unitCost: payload.unitCost,
      referenceNumber: payload.referenceNumber,
      referenceTicketId: payload.referenceTicketId,
      machineId: payload.machineId,
      sourceLocation: payload.sourceLocation,
      targetLocation: payload.targetLocation,
      performedBy: payload.performedBy,
      notes: payload.notes
    });
  },

  // Part Requests
  async getPartRequests(filter?: { status?: string; ticketId?: string; technicianId?: string }) {
    try {
      const params = new URLSearchParams();
      if (filter?.status && filter.status !== 'ALL') params.append('status', filter.status);
      if (filter?.ticketId) params.append('ticketId', filter.ticketId);
      if (filter?.technicianId) params.append('technicianId', filter.technicianId);
      const queryStr = params.toString() ? `?${params.toString()}` : '';

      const res = await apiFetch<any>(`/part-requests${queryStr}`);
      return res.items || res;
    } catch {
      let list = [...store.partRequests];
      if (filter?.status && filter.status !== 'ALL') {
        list = list.filter(r => r.status === filter.status);
      }
      if (filter?.ticketId) {
        list = list.filter(r => r.ticketId === filter.ticketId);
      }
      if (filter?.technicianId) {
        list = list.filter(r => r.technicianId === filter.technicianId);
      }
      return list.map(req => {
        const part = store.spareParts.find(p => p.id === (req.partId || req.sparePartId));
        const ticket = store.tickets.find(t => t.id === req.ticketId);
        const tech = store.technicians.find(t => t.id === req.technicianId);
        const sup = req.supplierId ? store.suppliers.find(s => s.id === req.supplierId) : undefined;
        return {
          ...req,
          part: part || req.part,
          sparePart: part || req.sparePart,
          partNumber: part?.partNumber || req.partNumber,
          partName: part?.name || req.partName,
          ticket: ticket || req.ticket,
          ticketNumber: ticket?.ticketNumber || req.ticketNumber,
          technician: tech || req.technician,
          technicianName: tech?.fullName || req.technicianName,
          supplier: sup || req.supplier
        };
      });
    }
  },

  async getPartRequestById(id: string) {
    try {
      return await apiFetch<SparePartRequest>(`/part-requests/${id}`);
    } catch {
      const req = store.partRequests.find(r => r.id === id || r.requestNumber === id);
      if (!req) return null;
      const part = store.spareParts.find(p => p.id === (req.partId || req.sparePartId));
      const ticket = store.tickets.find(t => t.id === req.ticketId);
      const tech = store.technicians.find(t => t.id === req.technicianId);
      const sup = req.supplierId ? store.suppliers.find(s => s.id === req.supplierId) : undefined;
      return {
        ...req,
        part: part || req.part,
        sparePart: part || req.sparePart,
        ticket: ticket || req.ticket,
        technician: tech || req.technician,
        supplier: sup
      };
    }
  },

  async createPartRequest(req: {
    ticket_id?: string;
    ticketId?: string;
    part_id?: string;
    sparePartId?: string;
    partName?: string;
    partNumber?: string;
    unitCost?: number;
    category?: string;
    storageLocation?: string;
    quantity: number;
    priority?: TicketPriority;
    reason?: string;
    notes?: string;
    technicianId?: string;
    technicianName?: string;
  }) {
    try {
      return await apiFetch<SparePartRequest>('/part-requests', {
        method: 'POST',
        body: JSON.stringify(req)
      });
    } catch {
      const ticketId = req.ticketId || req.ticket_id;
      const partId = req.sparePartId || req.part_id;
      let part = partId ? store.spareParts.find(p => p.id === partId) : undefined;
      if (!part && req.partNumber) {
        part = store.spareParts.find(p => p.partNumber?.toLowerCase() === req.partNumber?.toLowerCase());
      }
      if (!part && !req.partName && store.spareParts.length > 0) {
        part = store.spareParts[0];
      }
      const ticket = ticketId ? store.tickets.find(t => t.id === ticketId || t.ticketNumber === ticketId) : undefined;
      const techId = req.technicianId || ticket?.assignedTechnicianId || (store.technicians.length > 0 ? store.technicians[0].id : 'tech-1');
      const tech = store.technicians.find(t => t.id === techId) || store.technicians[0];

      const count = store.partRequests.length + 1;
      const reqNum = `REQ-2026-${String(count).padStart(4, '0')}`;
      const now = new Date().toISOString();

      const chosenPartNumber = (req.partNumber || part?.partNumber || `SKU-${Date.now().toString().slice(-6)}`).trim().toUpperCase();
      const chosenPartName = (req.partName || part?.nameAr || part?.name || 'قطعة غيار مطلوبة').trim();
      const chosenCost = Number(req.unitCost || part?.unitCost || 45);

      if (!part) {
        part = {
          id: `prt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          partNumber: chosenPartNumber,
          name: chosenPartName,
          nameAr: chosenPartName,
          category: req.category || 'GENERAL',
          unitCost: chosenCost,
          currentQuantity: 0,
          minimumQuantity: 2,
          minStockLevel: 2,
          maxStockLevel: 10,
          storageLocation: req.storageLocation || 'Central Warehouse Depot',
          isActive: true,
          status: 'ACTIVE',
          totalValue: 0,
          createdAt: now,
          updatedAt: now
        };
        store.spareParts.unshift(part);
      }

      const newReq: SparePartRequest = {
        id: `req-${Date.now()}`,
        requestNumber: reqNum,
        ticketId: ticket?.id,
        ticket: ticket,
        ticketNumber: ticket?.ticketNumber,
        machineId: ticket?.machineId,
        machine: ticket?.machine,
        machineNumber: ticket?.machine?.machineNumber,
        technicianId: tech?.id,
        technician: tech,
        technicianName: tech?.fullName || tech?.employeeCode || 'Technician',
        partId: part.id,
        sparePartId: part.id,
        part: part,
        sparePart: part,
        partNumber: chosenPartNumber,
        partName: chosenPartName,
        unitCost: chosenCost,
        estimatedCost: chosenCost * (Number(req.quantity) || 1),
        isCustomNonCatalog: false,
        storageLocation: req.storageLocation || part.storageLocation,
        category: req.category || (typeof part.category === 'string' ? part.category : 'GENERAL'),
        quantity: Math.max(1, req.quantity || 1),
        priority: req.priority || ticket?.priority || 'MEDIUM',
        status: 'REQUESTED',
        notes: req.notes,
        reason: req.reason || req.notes || `Requisition for ${chosenPartName} (${chosenPartNumber})`,
        timeline: [
          {
            status: 'REQUESTED',
            timestamp: now,
            actor: tech?.fullName || 'Technician',
            comment: req.reason || 'Requisition submitted to warehouse depot'
          }
        ],
        createdAt: now,
        updatedAt: now
      };

      store.partRequests.unshift(newReq);

      // If linked to a ticket, update ticket status to WAITING_FOR_PART
      if (ticket) {
        ticket.status = 'WAITING_FOR_PART';
        ticket.updatedAt = now;
        if (!ticket.timeline) ticket.timeline = [];
        ticket.timeline.unshift({
          id: `tl-${Date.now()}`,
          ticketId: ticket.id,
          timestamp: now,
          technicianName: tech?.fullName || tech?.employeeCode,
          technicianCode: tech?.employeeCode,
          technicianId: tech?.id,
          action: 'PART_REQUESTED',
          actionLabel: 'Requisition Filed',
          description: `Filed requisition ${reqNum} for ${newReq.quantity}x ${chosenPartName} (${chosenPartNumber}).`,
          part: {
            partNumber: chosenPartNumber,
            name: chosenPartName,
            quantity: newReq.quantity,
            unitCost: chosenCost,
            status: 'REQUESTED'
          }
        });
      }

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'PART_REQUEST_CREATED',
        entityName: 'SparePartRequest',
        entityId: reqNum,
        newValues: { partNumber: chosenPartNumber, quantity: newReq.quantity, ticket: ticket?.ticketNumber },
        createdAt: now
      });

      store.save();
      return newReq;
    }
  },

  /**
   * Lifecycle State Transitions for Spare Part Requests:
   * REQUESTED -> APPROVED -> ORDERED -> RECEIVED -> ISSUED (or REJECTED / CANCELLED)
   */
  async updatePartRequestStatus(
    id: string,
    status: PartRequestStatus,
    payload?: {
      comment?: string;
      poNumber?: string;
      supplierId?: string;
      actor?: string;
      expectedDeliveryDate?: string;
      rejectedReason?: string;
      rejectionReason?: string;
      autoReplenish?: boolean;
      autoIssue?: boolean;
    }
  ) {
    try {
      const updated = await apiFetch<SparePartRequest>(`/part-requests/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, ...payload })
      });
      // Fetch authoritative server state which contains updated catalog parts, inventory stock, transactions, and ticket status
      await store.fetchServerState();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
      }
      return updated;
    } catch {
      const r = store.partRequests.find(req => req.id === id || req.requestNumber === id);
      if (!r) throw new Error(`Part request with ID '${id}' not found`);

      const now = new Date().toISOString();
      const actor = payload?.actor || 'Warehouse Supervisor';
      const comment = payload?.comment || `Status moved to ${status}`;
      let part = store.spareParts.find(p => 
        p.id === (r.partId || r.sparePartId) ||
        (r.partNumber && p.partNumber?.toLowerCase() === r.partNumber.toLowerCase()) ||
        (r.partName && (p.name?.toLowerCase() === r.partName.toLowerCase() || p.nameAr?.toLowerCase() === r.partName.toLowerCase()))
      );

      r.status = status;
      r.updatedAt = now;
      if (!r.timeline) r.timeline = [];

      // Detailed transition side-effects
      if (status === 'APPROVED') {
        r.approvedBy = actor;
        r.approvedAt = now;
        const isStockAvailable = part ? (part.currentQuantity || 0) >= (Number(r.quantity) || 1) : false;
        r.isInStock = isStockAvailable;

        if (r.ticketId || r.ticketNumber) {
          const tck = store.tickets.find(t => t.id === r.ticketId || t.ticketNumber === r.ticketId || t.ticketNumber === r.ticketNumber);
          if (tck) {
            if (!tck.timeline) tck.timeline = [];
            tck.timeline.unshift({
              id: `tl-${Date.now()}`,
              ticketId: tck.id,
              timestamp: now,
              technicianName: actor,
              action: 'PART_APPROVED',
              actionLabel: isStockAvailable ? 'الموافقة على القطعة (متوفرة بالمخزن)' : 'الموافقة على الطلب (بانتظار أمر شراء)',
              description: isStockAvailable
                ? `تمت موافقة إدارة المخزن على طلب القطعة ${r.partName || part?.nameAr || part?.name}. القطعة متوفرة بالرصيد (${part?.currentQuantity} قطعة) وجاهزة لإصدار أمر الصرف الفوري.`
                : `تمت موافقة إدارة المخزن على طلب القطعة ${r.partName || part?.nameAr || part?.name}. القطعة غير متوفرة بالرصيد الحالي وجاري إصدار أمر شراء وتوريد خارجي من المورد.`
            });
          }
        }
      } else if (status === 'ORDERED') {
        r.orderedBy = actor;
        r.orderedAt = now;
        if (payload?.poNumber) r.poNumber = payload.poNumber;
        if (payload?.supplierId) {
          r.supplierId = payload.supplierId;
          r.supplier = store.suppliers.find(s => s.id === payload.supplierId);
        }
        if (payload?.expectedDeliveryDate) r.expectedDeliveryDate = payload.expectedDeliveryDate;

        if (r.ticketId || r.ticketNumber) {
          const tck = store.tickets.find(t => t.id === r.ticketId || t.ticketNumber === r.ticketId || t.ticketNumber === r.ticketNumber);
          if (tck) {
            if (!tck.timeline) tck.timeline = [];
            tck.timeline.unshift({
              id: `tl-${Date.now()}`,
              ticketId: tck.id,
              timestamp: now,
              technicianName: actor,
              action: 'PO_PLACED',
              actionLabel: 'إصدار أمر شراء من المورد',
              description: `تم إصدار أمر شراء خارجي رقم ${r.poNumber || 'PO-NEW'} من المورد (${r.supplier?.name || 'المورد المعتمد'}) لتوريد ${r.quantity}x ${r.partName || part?.nameAr || part?.name}. الموعد المتوقع للتوريد: ${r.expectedDeliveryDate || 'قريباً'}.`
            });
          }
        }
      } else if (status === 'RECEIVED') {
        r.receivedBy = actor;
        r.receivedAt = now;
        const qty = Number(r.quantity) || 1;

        // Auto-register newly received item in catalog if not already registered
        if (!part) {
          const newId = (r.partId && !r.partId.startsWith('custom-')) ? r.partId : `sp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          const partCost = Number((payload as any)?.unitCost || r.estimatedCost || r.unitCost || 45);
          part = {
            id: newId,
            partNumber: r.partNumber || `SKU-${Date.now().toString().slice(-6)}`,
            name: r.partName || 'Spare Part Item',
            nameAr: r.partName || 'قطعة غيار موردة',
            category: (r as any).category || 'GENERAL',
            unitCost: partCost,
            currentQuantity: 0,
            minimumQuantity: 2,
            reorderPoint: 2,
            reorderQuantity: 5,
            storageLocation: (payload as any)?.storageLocation || r.storageLocation || 'Central Warehouse Depot',
            status: 'ACTIVE',
            supplierId: r.supplierId,
            supplier: r.supplier,
            totalValue: 0,
            createdAt: now,
            updatedAt: now
          };
          store.spareParts.unshift(part);
        }

        r.partId = part.id;
        r.sparePartId = part.id;
        r.part = part;
        r.sparePart = part;
        r.partNumber = part.partNumber;
        r.partName = part.nameAr || part.name;

        // Automatically post RECEIVE transaction to replenish inventory
        if (payload?.autoReplenish !== false) {
          await this.postStockAdjustment({
            part_id: part.id,
            transaction_type: 'RECEIVE',
            quantity: qty,
            referenceNumber: r.poNumber || (payload as any)?.deliveryNoteNumber || r.requestNumber || 'PO-REPLENISH',
            referenceTicketId: r.ticketId,
            referenceTicketNumber: r.ticketNumber,
            performedBy: actor,
            notes: comment || `إذن استلام وتوريد للمخزن بموجب أمر الشراء ${r.poNumber || r.requestNumber || 'N/A'} للبلاغ ${r.ticketNumber || r.ticketId || ''}`
          });
        }

        // CRITICAL LINK: Notify Maintenance & Field Support
        if (r.ticketId || r.ticketNumber) {
          const tck = store.tickets.find(t => t.id === r.ticketId || t.ticketNumber === r.ticketId || t.ticketNumber === r.ticketNumber);
          if (tck) {
            if (!tck.timeline) tck.timeline = [];
            tck.timeline.unshift({
              id: `tl-${Date.now()}`,
              ticketId: tck.id,
              timestamp: now,
              technicianName: actor,
              action: 'PART_RECEIVED_AVAILABLE',
              actionLabel: 'وصلت قطعة الغيار بالمخزن (إشعار للصيانة)',
              description: `📢 إشعار لقسم الصيانة والدعم: تم توريد واستلام قطعة الغيار ${r.partName || part?.nameAr || part?.name} (${qty}x) بالمستودع بموجب إذن التوريد ${r.poNumber || r.requestNumber || 'N/A'}. القطعة الآن متوفرة بالرصيد وجاهزة للصرف الفوري لاستئناف الصيانة.`
            });
          }
        }
      } else if (status === 'ISSUED') {
        r.issuedBy = actor;
        r.issuedAt = now;
        const qty = Number(r.quantity) || 1;

        // Check stock availability & post ISSUE transaction
        if (part && payload?.autoIssue !== false) {
          await this.postStockAdjustment({
            part_id: part.id,
            transaction_type: 'ISSUE',
            quantity: qty,
            referenceTicketId: r.ticketId,
            referenceTicketNumber: r.ticketNumber,
            machineId: r.machineId,
            performedBy: actor,
            notes: comment || `أمر صرف وتسليم للموقع لصالح البلاغ ${r.ticketNumber || r.ticketId || ''} (${r.requestNumber || r.id})`
          });
        }

        // CRITICAL LINK: Automatically update ticket status to IN_PROGRESS and notify maintenance
        const tck = store.tickets.find(t => 
          t.id === r.ticketId || 
          t.ticketNumber === r.ticketId || 
          t.id === r.ticketNumber || 
          t.ticketNumber === r.ticketNumber
        );

        if (tck) {
          const prevStatus = tck.status;
          tck.status = 'IN_PROGRESS';
          tck.updatedAt = now;

          if (!tck.statusHistory) tck.statusHistory = [];
          tck.statusHistory.push({
            id: `sh-${Date.now()}`,
            ticketId: tck.id,
            previousStatus: prevStatus,
            newStatus: 'IN_PROGRESS',
            comment: `تم صرف وتسليم قطعة الغيار (${qty}x ${r.partName || part?.nameAr || part?.name}) للفني المختص، وتم تحويل حالة التذكرة تلقائياً إلى [قيد الإصلاح - IN_PROGRESS].`,
            createdAt: now
          });

          if (!tck.timeline) tck.timeline = [];
          tck.timeline.unshift({
            id: `tl-${Date.now()}`,
            ticketId: tck.id,
            timestamp: now,
            technicianId: r.technicianId || tck.assignedTechnicianId,
            technicianName: actor,
            action: 'PART_DISPATCHED_TO_FIELD',
            actionLabel: 'تم تسليم القطعة للفني (تحويل لقيد الإصلاح)',
            description: `📢 إشعار صيانة فوري: تم صرف وتسليم قطعة الغيار ${r.partName || part?.nameAr || part?.name} (${qty}x) من المستودع للفني المعتمد. تم استئناف حالة البلاغ فوراً من [${prevStatus}] إلى [قيد الإصلاح - IN_PROGRESS] لاستكمال أعمال الإصيانة.`
          });
        }
      } else if (status === 'REJECTED') {
        const reason = payload?.rejectedReason || (payload as any)?.rejectionReason || comment;
        r.rejectedReason = reason;
        r.rejectionReason = reason;
      }

      r.timeline.unshift({
        status,
        timestamp: now,
        actor,
        comment
      });

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: `PART_REQUEST_${status}`,
        entityName: 'SparePartRequest',
        entityId: r.requestNumber || r.id,
        newValues: { status, actor, comment },
        createdAt: now
      });

      store.save();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
      }
      return r;
    }
  },

  async updatePartRequest(id: string, updates: Partial<SparePartRequest>) {
    try {
      const updated = await apiFetch<SparePartRequest>(`/part-requests/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      const idx = store.partRequests.findIndex(req => req.id === id || req.requestNumber === id);
      if (idx !== -1) {
        store.partRequests[idx] = { ...store.partRequests[idx], ...updated };
      }
      store.save(false);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
      }
      return updated;
    } catch {
      const r = store.partRequests.find(req => req.id === id || req.requestNumber === id);
      if (!r) throw new Error(`Part request with ID '${id}' not found`);

      if (updates.quantity !== undefined) r.quantity = Math.max(1, Number(updates.quantity));
      if (updates.priority !== undefined) r.priority = updates.priority;
      if (updates.notes !== undefined) r.notes = updates.notes;
      if (updates.reason !== undefined) r.reason = updates.reason;
      if (updates.poNumber !== undefined) r.poNumber = updates.poNumber;
      if (updates.supplierId !== undefined) {
        r.supplierId = updates.supplierId;
        r.supplier = store.suppliers.find(s => s.id === updates.supplierId);
      }
      r.updatedAt = new Date().toISOString();

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'PART_REQUEST_UPDATED',
        entityName: 'SparePartRequest',
        entityId: r.requestNumber || r.id,
        newValues: { quantity: r.quantity, priority: r.priority, notes: r.notes },
        createdAt: new Date().toISOString()
      });

      store.save();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
      }
      return r;
    }
  },

  async cancelPartRequest(id: string, reason?: string) {
    try {
      const updated = await apiFetch<SparePartRequest>(`/part-requests/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
      const idx = store.partRequests.findIndex(req => req.id === id || req.requestNumber === id);
      if (idx !== -1) {
        store.partRequests[idx] = { ...store.partRequests[idx], ...updated };
      }
      store.save(false);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
      }
      return updated;
    } catch {
      const r = store.partRequests.find(req => req.id === id || req.requestNumber === id);
      if (!r) throw new Error(`Part request with ID '${id}' not found`);

      if (['RECEIVED', 'ISSUED'].includes(r.status)) {
        throw new Error(`Cannot cancel a requisition that has already been fulfilled or issued.`);
      }

      return await this.updatePartRequestStatus(id, 'CANCELLED', {
        actor: 'Warehouse Supervisor',
        comment: reason || 'Requisition cancelled'
      });
    }
  },

  async deletePartRequest(id: string, hardDelete = false, reason?: string) {
    try {
      const res = await apiFetch<any>(`/part-requests/${id}?hardDelete=${hardDelete}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason })
      });
      if (hardDelete) {
        const idx = store.partRequests.findIndex(req => req.id === id || req.requestNumber === id);
        if (idx !== -1) store.partRequests.splice(idx, 1);
      } else {
        const r = store.partRequests.find(req => req.id === id || req.requestNumber === id);
        if (r) {
          r.isDeleted = true;
          r.deletedAt = new Date().toISOString();
        }
      }
      store.save(false);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
      }
      return res;
    } catch {
      const r = store.partRequests.find(req => req.id === id || req.requestNumber === id);
      if (!r) throw new Error(`Part request with ID '${id}' not found`);

      if (['RECEIVED', 'ISSUED'].includes(r.status)) {
        throw new Error(`Cannot delete requisition ${r.requestNumber || r.id} because it has already been received/issued to maintenance.`);
      }

      if (hardDelete) {
        const idx = store.partRequests.findIndex(req => req.id === r.id);
        if (idx !== -1) store.partRequests.splice(idx, 1);
      } else {
        r.isDeleted = true;
        r.deletedAt = new Date().toISOString();
        r.deletedBy = 'System Admin';
        r.deletionReason = reason || 'Requisition discarded';
        r.updatedAt = new Date().toISOString();
      }

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'PART_REQUEST_DELETED',
        entityName: 'SparePartRequest',
        entityId: r.requestNumber || r.id,
        newValues: { isDeleted: true, reason: r.deletionReason },
        createdAt: new Date().toISOString()
      });

      store.save();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
      }
      return { success: true };
    }
  },

  // Machine Part History (Audit trail of every component installed on this machine)
  async getMachinePartsHistory(machineId: string): Promise<MachinePartHistoryRecord[]> {
    const targetMachine = store.machines.find(m => m.id === machineId || m.machineNumber === machineId);
    const mId = targetMachine ? targetMachine.id : machineId;
    const mNum = targetMachine ? targetMachine.machineNumber : machineId;

    const records: MachinePartHistoryRecord[] = [];

    // Scan all maintenance actions and tickets
    for (const tck of store.tickets) {
      if (tck.machineId === mId || tck.machine?.id === mId || tck.machine?.machineNumber === mNum) {
        // Check ticket maintenance actions
        if (tck.maintenanceActions) {
          for (const ma of tck.maintenanceActions) {
            if (ma.partsUsed) {
              for (const pu of ma.partsUsed) {
                const part = pu.sparePart || store.spareParts.find(p => p.id === pu.partId);
                if (part) {
                  records.push({
                    id: `mph-${ma.id}-${part.id}`,
                    machineId: mId,
                    machineNumber: mNum,
                    partId: part.id,
                    partNumber: part.partNumber,
                    partName: part.name,
                    quantity: pu.quantity,
                    unitCost: pu.unitCostAtUse || part.unitCost,
                    totalCost: pu.quantity * (pu.unitCostAtUse || part.unitCost),
                    ticketId: tck.id,
                    ticketNumber: tck.ticketNumber,
                    technicianId: ma.technicianId || tck.assignedTechnicianId,
                    technicianName: ma.technician?.fullName || tck.assignedTechnician?.fullName || 'Field Technician',
                    installedAt: ma.performedAt || ma.createdAt || tck.resolvedAt || tck.createdAt,
                    reason: ma.description || tck.description
                  });
                }
              }
            }
          }
        }

        // Check timeline items with parts
        if (tck.timeline) {
          for (const tl of tck.timeline) {
            if (tl.part && tl.action === 'PART_REQUESTED' && !records.some(r => r.ticketId === tck.id && r.partNumber === tl.part?.partNumber)) {
              const part = store.spareParts.find(p => p.partNumber === tl.part?.partNumber);
              if (part) {
                records.push({
                  id: `mph-tl-${tl.id}`,
                  machineId: mId,
                  machineNumber: mNum,
                  partId: part.id,
                  partNumber: part.partNumber,
                  partName: part.name,
                  quantity: tl.part.quantity,
                  unitCost: tl.part.unitCost || part.unitCost,
                  totalCost: tl.part.quantity * (tl.part.unitCost || part.unitCost),
                  ticketId: tck.id,
                  ticketNumber: tck.ticketNumber,
                  technicianId: tl.technicianId || tck.assignedTechnicianId,
                  technicianName: tl.technicianName || 'Field Technician',
                  installedAt: tl.timestamp,
                  reason: tl.description
                });
              }
            }
          }
        }
      }
    }

    // Also scan inventory transactions linked directly to machine
    for (const tx of store.transactions) {
      if ((tx.machineId === mId || tx.machineNumber === mNum) && tx.transactionType === 'ISSUE') {
        const part = tx.part || tx.sparePart || store.spareParts.find(p => p.id === tx.partId);
        if (part && !records.some(r => r.ticketId === tx.referenceTicketId && r.partId === part.id)) {
          records.push({
            id: `mph-tx-${tx.id}`,
            machineId: mId,
            machineNumber: mNum,
            partId: part.id,
            partNumber: part.partNumber,
            partName: part.name,
            quantity: Math.abs(tx.quantityDelta || tx.quantity || 1),
            unitCost: tx.unitCost || part.unitCost,
            totalCost: (tx.quantity || 1) * (tx.unitCost || part.unitCost),
            ticketId: tx.referenceTicketId || 'DIRECT-DISPATCH',
            ticketNumber: tx.referenceTicketNumber || tx.referenceNumber || 'TX-DISPATCH',
            technicianName: tx.performedBy,
            installedAt: tx.createdAt,
            reason: tx.notes || 'Warehouse direct issue to machine'
          });
        }
      }
    }

    return records.sort((a, b) => new Date(b.installedAt).getTime() - new Date(a.installedAt).getTime());
  },

  // Part Usage History (Audit trail of everywhere this SKU has moved or been consumed)
  async getPartUsageHistory(partId: string): Promise<PartUsageRecord[]> {
    const part = store.spareParts.find(p => p.id === partId || p.partNumber === partId);
    if (!part) return [];

    const txs = store.transactions.filter(t => t.partId === part.id || t.sparePartId === part.id);
    return txs.map(tx => ({
      id: tx.id,
      partId: part.id,
      partNumber: part.partNumber,
      partName: part.name,
      transactionType: tx.transactionType,
      quantity: Math.abs(tx.quantityDelta || tx.quantity || 0),
      balanceAfter: tx.balanceAfter,
      unitCost: tx.unitCost || part.unitCost,
      ticketId: tx.referenceTicketId,
      ticketNumber: tx.referenceTicketNumber,
      machineId: tx.machineId,
      machineNumber: tx.machineNumber,
      performedBy: tx.performedBy,
      notes: tx.notes,
      date: tx.createdAt
    }));
  },

  // Aggregate Inventory Telemetry & Alerts
  async getInventoryStats() {
    const parts = store.spareParts;
    const totalSkus = parts.length;
    const totalUnits = parts.reduce((acc, p) => acc + (p.currentQuantity || 0), 0);
    const totalValuation = parts.reduce((acc, p) => acc + ((p.currentQuantity || 0) * (p.unitCost || 0)), 0);
    const lowStockCount = parts.filter(p => p.currentQuantity > 0 && p.currentQuantity <= (p.minStockLevel ?? 5)).length;
    const outOfStockCount = parts.filter(p => (p.currentQuantity || 0) === 0).length;
    const pendingRequestsCount = store.partRequests.filter(r => ['REQUESTED', 'PENDING', 'APPROVED', 'ORDERED'].includes(r.status)).length;

    // Valuation by category
    const categoryBreakdown: Record<string, number> = {};
    for (const p of parts) {
      const catName = typeof p.category === 'object' ? p.category.name : (p.category || 'General');
      categoryBreakdown[catName] = (categoryBreakdown[catName] || 0) + (p.currentQuantity * p.unitCost);
    }

    return {
      totalSkus,
      totalUnits,
      totalValuation,
      lowStockCount,
      outOfStockCount,
      pendingRequestsCount,
      categoryBreakdown
    };
  },

  // Suppliers
  async getSuppliers(includeInactive = true) {
    try {
      const res = await apiFetch<Supplier[]>(includeInactive ? '/suppliers?include_inactive=true' : '/suppliers');
      return res;
    } catch {
      let sups = store.suppliers.filter(s => !s.isDeleted);
      if (!includeInactive) {
        sups = sups.filter(s => s.isActive !== false);
      }
      return sups.map(s => {
        const suppliedPartsCount = store.spareParts.filter(p => (p.supplierId === s.id || p.manufacturer === s.name) && !p.isDeleted).length;
        return {
          ...s,
          suppliedPartsCount
        };
      });
    }
  },

  async getSupplierById(id: string) {
    const s = store.suppliers.find(sup => sup.id === id || sup.name === id);
    if (!s) return null;
    const suppliedPartsCount = store.spareParts.filter(p => (p.supplierId === s.id || p.manufacturer === s.name) && !p.isDeleted).length;
    return { ...s, suppliedPartsCount };
  },

  async checkSupplierReferences(id: string): Promise<{
    canDelete: boolean;
    referenceCounts: Array<{ label: string; count: number }>;
  }> {
    const sup = store.suppliers.find(s => s.id === id || s.name === id);
    if (!sup) return { canDelete: true, referenceCounts: [] };

    const parts = store.spareParts.filter(p => (p.supplierId === sup.id || p.manufacturer === sup.name) && !p.isDeleted);
    const requests = store.partRequests.filter(r => r.supplierId === sup.id && !r.isDeleted);

    const counts = [
      { label: 'Catalog Spare Parts', count: parts.length },
      { label: 'Requisitions / Orders', count: requests.length }
    ];

    return {
      canDelete: parts.length === 0 && requests.length === 0,
      referenceCounts: counts
    };
  },

  async createSupplier(supplier: Partial<Supplier>) {
    try {
      return await apiFetch<Supplier>('/suppliers', {
        method: 'POST',
        body: JSON.stringify(supplier)
      });
    } catch {
      const code = supplier.code || supplier.supplierCode || `SUP-${Date.now().toString().slice(-4)}`;
      const now = new Date().toISOString();
      const newSup: Supplier = {
        id: `sup-${Date.now()}`,
        code: code,
        supplierCode: code,
        name: (supplier.name || 'New Supplier').trim(),
        nameAr: supplier.nameAr,
        contactName: supplier.contactName || supplier.contactPerson || 'Procurement Rep',
        contactPerson: supplier.contactPerson || supplier.contactName || 'Procurement Rep',
        contactPersonAr: supplier.contactPersonAr,
        email: (supplier.email || 'orders@supplier.com').trim(),
        phone: supplier.phone || '+966-11-0000000',
        address: supplier.address || 'Industrial Area, Riyadh',
        addressAr: supplier.addressAr,
        leadTimeDays: Number(supplier.leadTimeDays) || 3,
        paymentTerms: supplier.paymentTerms || 'Net 30 Days',
        rating: supplier.rating || 4.8,
        suppliedPartsCount: 0,
        isActive: true,
        isDeleted: false,
        createdAt: now,
        updatedAt: now
      };
      store.suppliers.push(newSup);
      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'SUPPLIER_CREATED',
        entityName: 'Supplier',
        entityId: newSup.code || newSup.id,
        userName: 'Super Administrator',
        newValues: { name: newSup.name, code: newSup.code, email: newSup.email },
        timestamp: now,
        createdAt: now
      });
      return newSup;
    }
  },

  async updateSupplier(id: string, updates: Partial<Supplier>) {
    try {
      return await apiFetch<Supplier>(`/suppliers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
    } catch {
      const s = store.suppliers.find(sup => sup.id === id);
      if (!s) throw new Error('Supplier not found');

      const oldValues = { name: s.name, contactName: s.contactName, email: s.email, phone: s.phone, isActive: s.isActive };
      if (updates.name !== undefined) s.name = updates.name.trim();
      if (updates.contactName !== undefined) s.contactName = updates.contactName.trim();
      if (updates.contactPerson !== undefined) s.contactPerson = updates.contactPerson.trim();
      if (updates.email !== undefined) s.email = updates.email.trim();
      if (updates.phone !== undefined) s.phone = updates.phone.trim();
      if (updates.address !== undefined) s.address = updates.address.trim();
      if (updates.leadTimeDays !== undefined) s.leadTimeDays = Number(updates.leadTimeDays);
      if (updates.paymentTerms !== undefined) s.paymentTerms = updates.paymentTerms;
      if (updates.rating !== undefined) s.rating = Number(updates.rating);
      if (updates.isActive !== undefined) s.isActive = updates.isActive;
      s.updatedAt = new Date().toISOString();

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'SUPPLIER_UPDATED',
        entityName: 'Supplier',
        entityId: s.id,
        oldValues,
        newValues: { name: s.name, email: s.email, isActive: s.isActive },
        createdAt: new Date().toISOString()
      });
      return s;
    }
  },

  async deactivateSupplier(id: string, reason?: string) {
    try {
      return await apiFetch<Supplier>(`/suppliers/${id}/deactivate`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
    } catch {
      const s = store.suppliers.find(sup => sup.id === id);
      if (!s) throw new Error('Supplier not found');

      s.isActive = false;
      s.deactivatedAt = new Date().toISOString();
      s.deactivatedBy = 'System Admin';
      s.deactivationReason = reason || 'Vendor deactivated';
      s.updatedAt = new Date().toISOString();

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'SUPPLIER_DEACTIVATED',
        entityName: 'Supplier',
        entityId: s.id,
        newValues: { isActive: false, reason: s.deactivationReason },
        createdAt: new Date().toISOString()
      });

      return s;
    }
  },

  async reactivateSupplier(id: string) {
    try {
      return await apiFetch<Supplier>(`/suppliers/${id}/reactivate`, {
        method: 'POST'
      });
    } catch {
      const s = store.suppliers.find(sup => sup.id === id);
      if (!s) throw new Error('Supplier not found');

      s.isActive = true;
      s.deactivatedAt = undefined;
      s.deactivatedBy = undefined;
      s.deactivationReason = undefined;
      s.updatedAt = new Date().toISOString();

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'SUPPLIER_REACTIVATED',
        entityName: 'Supplier',
        entityId: s.id,
        newValues: { isActive: true },
        createdAt: new Date().toISOString()
      });

      return s;
    }
  },

  async deleteSupplier(id: string, hardDelete = false, reason?: string) {
    try {
      return await apiFetch<any>(`/suppliers/${id}?hardDelete=${hardDelete}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason })
      });
    } catch {
      const s = store.suppliers.find(sup => sup.id === id);
      if (!s) throw new Error('Supplier not found');

      const refs = await this.checkSupplierReferences(s.id);
      if (hardDelete && !refs.canDelete) {
        throw new Error(
          `Cannot permanently delete vendor "${s.name}" because it is linked to catalog spare parts or active purchase requisitions. Please deactivate the supplier instead.`
        );
      }

      if (hardDelete) {
        const idx = store.suppliers.findIndex(sup => sup.id === s.id);
        if (idx !== -1) store.suppliers.splice(idx, 1);

        store.auditLogs.unshift({
          id: `aud-${Date.now()}`,
          action: 'SUPPLIER_PURGED',
          entityName: 'Supplier',
          entityId: s.id,
          newValues: { reason: reason || 'Hard delete' },
          createdAt: new Date().toISOString()
        });
      } else {
        s.isDeleted = true;
        s.isActive = false;
        s.deletedAt = new Date().toISOString();
        s.deletedBy = 'System Admin';
        s.deletionReason = reason || 'Soft deleted';
        s.updatedAt = new Date().toISOString();

        store.auditLogs.unshift({
          id: `aud-${Date.now()}`,
          action: 'SUPPLIER_DELETED',
          entityName: 'Supplier',
          entityId: s.id,
          newValues: { isDeleted: true, reason: s.deletionReason },
          createdAt: new Date().toISOString()
        });
      }

      return { success: true };
    }
  },

  // Reports
  async getMTTRReport() {
    try {
      return await apiFetch<any>('/reports/mttr');
    } catch {
      return {
        overall_mttr_hours: 3.4,
        overall_mtbf_hours: 142.0,
        sla_compliance_rate: 94.2,
        total_tickets_analyzed: 48,
        sla_breaches_count: 2,
        mttr_by_priority: [
          { priority: 'CRITICAL', avg_hours: 1.8, count: 6, target_sla_hours: 2.0 },
          { priority: 'HIGH', avg_hours: 3.2, count: 14, target_sla_hours: 4.0 },
          { priority: 'MEDIUM', avg_hours: 7.5, count: 20, target_sla_hours: 12.0 },
          { priority: 'LOW', avg_hours: 18.2, count: 8, target_sla_hours: 24.0 }
        ],
        monthly_trend: [
          { month: 'Oct 2025', mttr: 4.8, count: 18 },
          { month: 'Nov 2025', mttr: 4.2, count: 22 },
          { month: 'Dec 2025', mttr: 3.9, count: 25 },
          { month: 'Jan 2026', mttr: 3.6, count: 30 },
          { month: 'Feb 2026', mttr: 3.4, count: 48 }
        ]
      };
    }
  },

  async getChronicFailuresReport() {
    try {
      return await apiFetch<any>('/reports/chronic-failures');
    } catch {
      return {
        total_chronic_machines: 2,
        chronic_machines: [
          {
            machine_id: 'mch-005',
            machine_number: 'VM-B03-F01-01',
            public_id: 'VM-P9Q4R2',
            location_description: 'Medical City > Ground Floor Emergency > ER Waiting Room',
            failure_count_30d: 3,
            primary_fault_category: 'REFRIGERATION',
            total_downtime_hours: 28.5,
            health_score: 32
          },
          {
            machine_id: 'mch-002',
            machine_number: 'VM-B01-F02-02',
            public_id: 'VM-C7D4E1',
            location_description: 'HQ Complex > First Floor > Executive Lounge',
            failure_count_30d: 2,
            primary_fault_category: 'COFFEE_BREWING',
            total_downtime_hours: 8.0,
            health_score: 78
          }
        ]
      };
    }
  },

  async getInventoryValuationReport() {
    try {
      return await apiFetch<any>('/reports/inventory-valuation');
    } catch {
      const totalCost = store.spareParts.reduce((acc, p) => acc + (p.currentQuantity * p.unitCost), 0);
      const lowStockCount = store.spareParts.filter(p => p.currentQuantity <= p.minStockLevel).length;
      return {
        total_skus: store.spareParts.length,
        total_stock_value: totalCost,
        total_units_on_hand: store.spareParts.reduce((acc, p) => acc + p.currentQuantity, 0),
        low_stock_skus_count: lowStockCount,
        category_breakdown: store.categories.map(c => {
          const parts = store.spareParts.filter(p => p.categoryId === c.id);
          const val = parts.reduce((acc, p) => acc + (p.currentQuantity * p.unitCost), 0);
          return {
            category_id: c.id,
            category_name: c.name,
            total_value: val,
            sku_count: parts.length
          };
        })
      };
    }
  },

  async getMachineLifecycleReport() {
    try {
      return await apiFetch<any>('/reports/machine-lifecycle');
    } catch {
      return {
        total_fleet_size: store.machines.length,
        average_fleet_age_months: 18.5,
        total_maintenance_cost: 3840.00,
        lifecycle_overview: store.machines.map(m => ({
          machine_id: m.id,
          machine_number: m.machineNumber,
          model: m.machineType,
          age_months: 20,
          health_score: m.healthScore,
          total_tickets: store.tickets.filter(t => t.machineId === m.id).length,
          total_parts_cost: store.tickets.filter(t => t.machineId === m.id).reduce((acc, t) => acc + t.totalPartsCost, 0),
          status: m.status
        }))
      };
    }
  },

  // Auth & Initial Super Admin Setup
  async getAuthStatus() {
    return await apiFetch<{
      state: 'INITIAL_SETUP' | 'SYSTEM_READY' | 'ADMIN_RECOVERY_REQUIRED';
      setupRequired: boolean;
      recoveryRequired: boolean;
      hasUsers: boolean;
      companyName?: string;
    }>('/auth/status');
  },

  async registerInitialAdmin(data: {
    companyName: string;
    fullName: string;
    email: string;
    phone?: string;
    password?: string;
    city?: string;
  }) {
    return await apiFetch<any>('/auth/setup-initial-admin', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async setupInitialAdmin(data: {
    companyName: string;
    fullName: string;
    email: string;
    phone?: string;
    password?: string;
    city?: string;
  }) {
    return await this.registerInitialAdmin(data);
  },

  async login(email: string, password?: string) {
    if (!email || !email.trim()) {
      throw new Error('يرجى إدخال البريد الإلكتروني');
    }
    if (!password || !password.trim()) {
      throw new Error('يرجى إدخال كلمة المرور');
    }
    return await apiFetch<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), password })
    });
  },

  async getMe() {
    return await apiFetch<{ success: boolean; user: User }>('/auth/me');
  },

  async logout() {
    try {
      await apiFetch<any>('/auth/logout', { method: 'POST' });
    } catch {
      // Best effort backend session cleanup
    }
  },

  async resetUsers(confirmReset: boolean = true) {
    return await apiFetch('/auth/reset-users', {
      method: 'POST',
      body: JSON.stringify({ confirmReset })
    });
  },

  async adminResetPassword(userId: string, newPassword: string) {
    return await apiFetch<any>('/auth/admin/reset-password', {
      method: 'POST',
      body: JSON.stringify({ userId, newPassword })
    });
  },

  // Users & Audit Logs
  async getUsers() {
    try {
      const res = await apiFetch<any>('/users');
      return res.items || res;
    } catch {
      return store.users;
    }
  },

  async createUser(user: Partial<User>) {
    try {
      return await apiFetch<User>('/users', {
        method: 'POST',
        body: JSON.stringify(user)
      });
    } catch {
      const newUsr: User = {
        id: `usr-${Date.now()}`,
        email: user.email || `user-${Date.now()}@vendingfleet.com`,
        fullName: user.fullName || 'Fleet Operator',
        phone: user.phone,
        role: user.role || 'TECHNICIAN',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      store.users.push(newUsr);
      return newUsr;
    }
  },

  async updateUser(id: string, updates: Partial<User>) {
    try {
      return await apiFetch<User>(`/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
    } catch {
      const idx = store.users.findIndex(u => u.id === id);
      if (idx !== -1) {
        store.users[idx] = {
          ...store.users[idx],
          ...updates,
          updatedAt: new Date().toISOString()
        };
        return store.users[idx];
      }
      throw new Error('User not found');
    }
  },

  async deleteUser(id: string, reason?: string) {
    try {
      return await apiFetch<any>(`/users/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason })
      });
    } catch {
      const idx = store.users.findIndex(u => u.id === id);
      if (idx !== -1) {
        const deleted = store.users.splice(idx, 1)[0];
        return { success: true, deletedUser: deleted };
      }
      throw new Error('User not found');
    }
  },

  async getAuditLogs() {
    try {
      const res = await apiFetch<any>('/audit-logs');
      return res.items || res;
    } catch {
      return store.auditLogs.map(log => {
        const timestamp = log.timestamp || log.createdAt || new Date().toISOString();
        const userName = log.userName || log.user?.fullName || 'Super Administrator';
        const user = log.user || {
          id: log.userId || 'usr-admin-01',
          fullName: userName,
          email: 'admin@vendingfleet.com',
          role: 'SUPER_ADMIN' as UserRole,
          isActive: true,
          createdAt: timestamp
        };
        const entity = (log as any).entity || log.entityName || log.entityType || 'Record';
        return {
          ...log,
          user,
          userName,
          entity,
          entityName: entity,
          entityType: entity,
          timestamp,
          createdAt: log.createdAt || timestamp
        };
      });
    }
  },

  // Import Center & Import History API
  async getImportBatches(): Promise<ImportBatch[]> {
    try {
      const res = await apiFetch<any>('/import/batches');
      return res.items || res;
    } catch {
      return store.importBatches;
    }
  },

  async getImportBatchDetails(batchId: string): Promise<{ batch: ImportBatch; rows: ImportRowEntity[] } | null> {
    try {
      return await apiFetch<any>(`/import/batches/${batchId}`);
    } catch {
      const batch = store.importBatches.find(b => b.id === batchId);
      if (!batch) return null;
      const rows = store.importRows.filter(r => r.importId === batchId);
      return { batch, rows };
    }
  },

  async getImportBatchRows(batchId: string): Promise<ImportRowEntity[]> {
    try {
      const res = await apiFetch<any>(`/import/batches/${batchId}/rows`);
      return res.items || res;
    } catch {
      return store.importRows.filter(r => r.importId === batchId);
    }
  },

  async commitImportBatch(payload: {
    batch: Partial<ImportBatch>;
    records: NormalizedMachineRecord[];
    options?: ImportCommitOptions;
  }): Promise<{
    success: boolean;
    batchId: string;
    machinesImported: number;
    buildingsCreated: number;
    locationsCreated: number;
    firstMachineId?: string;
    batch: ImportBatch;
  }> {
    const { batch, records, options } = payload;
    const batchId = batch.id || `imp-batch-${Date.now()}`;
    const timestamp = new Date().toISOString();

    // 0. Transaction Snapshot for Automatic Rollback Safety
    const snapshot = {
      machines: JSON.parse(JSON.stringify(store.machines)),
      buildings: JSON.parse(JSON.stringify(store.buildings)),
      floors: JSON.parse(JSON.stringify(store.floors)),
      locations: JSON.parse(JSON.stringify(store.locations)),
      importBatches: JSON.parse(JSON.stringify(store.importBatches)),
      importRows: JSON.parse(JSON.stringify(store.importRows)),
      auditLogs: JSON.parse(JSON.stringify(store.auditLogs))
    };

    try {
      // 1. Filter records based on options and explicit human review approval
      const recordsToImport = records.filter(r => {
        // Group C: INVALID records must NEVER be imported
        if (r.dataQualityStatus === 'INVALID' || r.reviewAction === 'REJECT') {
          return false;
        }

        // Group B: REVIEW_REQUIRED records must only be imported if explicitly approved
        if (r.dataQualityStatus === 'REVIEW_REQUIRED') {
          const isApproved = r.reviewAction === 'APPROVE' || 
                             r.reviewAction === 'APPROVE_WITH_NULL_SERIAL' || 
                             r.reviewAction === 'CORRECT_MACHINE_NUMBER' || 
                             r.reviewAction === 'CORRECT_SERIAL';
          if (!isApproved) {
            return false; // Skip un-approved review records
          }
        }

        // Group A: VALID records
        return true;
      });

      // 1.5. If replaceEntireDatabase is enabled, clear all previous mock/virtual fleet & hierarchy
      if (options?.replaceEntireDatabase) {
        store.machines = [];
        store.buildings = [];
        store.floors = [];
        store.locations = [];
        store.tickets = [];
        store.importBatches = [];
        store.importRows = [];
      }

      // 2. Resolve Buildings & Locations Hierarchy
      let buildingsCreatedCount = 0;
      let locationsCreatedCount = 0;

      const buildingMap = new Map<string, Building>();
      store.buildings.forEach(b => {
        buildingMap.set(b.name.toLowerCase().trim(), b);
      });

      const locationMap = new Map<string, Location>();
      store.locations.forEach(loc => {
        locationMap.set(`${loc.buildingId}__${loc.areaZone.toLowerCase().trim()}`, loc);
      });

      const createdMachines: Machine[] = [];
      const importRowEntities: ImportRowEntity[] = [];

      for (const rec of recordsToImport) {
        // Find or create Building
        const bldKey = rec.buildingName.toLowerCase().trim();
        let bld = buildingMap.get(bldKey);

        if (!bld) {
          const bldCode = `BLD-${String(store.buildings.length + 1).padStart(2, '0')}`;
          bld = {
            id: `bld-${Date.now()}-${store.buildings.length + 1}`,
            code: bldCode,
            name: rec.buildingName,
            createdAt: timestamp,
            updatedAt: timestamp
          };
          store.buildings.push(bld);
          buildingMap.set(bldKey, bld);
          buildingsCreatedCount++;
        }

        // Find or create Floor
        let floor = store.floors.find(f => f.buildingId === bld!.id && f.floorName.toLowerCase() === (rec.floorName || 'Level 1').toLowerCase());
        if (!floor) {
          const flrNum = store.floors.filter(f => f.buildingId === bld!.id).length + 1;
          floor = {
            id: `flr-${Date.now()}-${store.floors.length + 1}`,
            buildingId: bld.id,
            floorNumber: flrNum,
            levelOrder: flrNum,
            floorName: rec.floorName || 'Level 1',
            createdAt: timestamp
          };
          store.floors.push(floor);
        }

        // Find or create Location
        const locKey = `${bld.id}__${(rec.areaZone || rec.locationName).toLowerCase().trim()}`;
        let loc = locationMap.get(locKey);

        if (!loc) {
          loc = {
            id: `loc-${Date.now()}-${store.locations.length + 1}`,
            buildingId: bld.id,
            floorId: floor.id,
            floor: floor,
            building: bld,
            areaZone: rec.areaZone || rec.locationName,
            fullDescription: `${bld.name} — ${floor.floorName} — ${rec.areaZone || rec.locationName}`,
            isActive: true,
            createdAt: timestamp
          };
          store.locations.push(loc);
          locationMap.set(locKey, loc);
          locationsCreatedCount++;
        }

        // Determine Serial Number Policy Compliance
        let effectiveSerial = rec.serialNumber;
        let serialVerificationStatus: 'VERIFIED' | 'PENDING_PHYSICAL_VERIFICATION' | 'UNVERIFIED' = 'VERIFIED';

        if (rec.reviewAction === 'APPROVE_WITH_NULL_SERIAL' || !effectiveSerial || rec.isMissingSerial) {
          effectiveSerial = undefined;
          serialVerificationStatus = 'PENDING_PHYSICAL_VERIFICATION';
        }

        // Create or update Machine (Generate QR code only for successfully inserted machines)
        const publicId = `VM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const newMachine: Machine = {
          id: `mch-imp-${Date.now()}-${createdMachines.length + 1}`,
          publicId,
          machineNumber: rec.machineNumber,
          serialNumber: effectiveSerial,
          machineType: rec.machineType || 'Combination Snack & Cold Drinks',
          status: rec.status || 'OPERATIONAL',
          dataQualityStatus: rec.dataQualityStatus,
          healthScore: rec.healthScore || (rec.dataQualityStatus === 'VALID' ? 95 : 75),
          installationDate: timestamp.split('T')[0],
          currentLocation: loc,
          createdAt: timestamp,
          updatedAt: timestamp
        };

        // Check if machine with this machineNumber already exists
        const existingIdx = store.machines.findIndex(m => m.machineNumber.toUpperCase() === rec.machineNumber.toUpperCase());
        if (existingIdx >= 0) {
          if (options?.overwriteDuplicates) {
            store.machines[existingIdx] = {
              ...store.machines[existingIdx],
              ...newMachine,
              id: store.machines[existingIdx].id
            };
            createdMachines.push(store.machines[existingIdx]);
          }
        } else {
          store.machines.push(newMachine);
          createdMachines.push(newMachine);
        }

        // Record ImportRowEntity with full coordinate preservation
        const rowEntity: ImportRowEntity = {
          id: `imp-row-${Date.now()}-${importRowEntities.length + 1}`,
          importId: batchId,
          sourceSheet: rec.raw.coordinates.sourceSheet,
          sourceColumn: rec.raw.coordinates.sourceColumn,
          sourceRow: rec.raw.coordinates.sourceRow,
          originalMachineNumber: rec.raw.originalMachineNumber,
          originalSerialNumber: rec.raw.originalSerialNumber,
          originalBuilding: rec.raw.originalBuilding,
          originalLocation: rec.raw.originalLocation,
          normalizedMachineId: rec.machineNumber,
          dataQualityStatus: rec.dataQualityStatus,
          detectedIssues: rec.issues,
          createdAt: timestamp
        };
        importRowEntities.push(rowEntity);
        store.importRows.push(rowEntity);
      }

      const totalApproved = records.filter(r => r.dataQualityStatus === 'VALID' || r.reviewAction === 'APPROVE' || r.reviewAction === 'APPROVE_WITH_NULL_SERIAL' || r.reviewAction === 'CORRECT_MACHINE_NUMBER' || r.reviewAction === 'CORRECT_SERIAL').length;
      const totalRejected = records.filter(r => r.dataQualityStatus === 'INVALID' || r.reviewAction === 'REJECT').length;
      const totalRequiringReview = records.filter(r => r.dataQualityStatus === 'REVIEW_REQUIRED' && !r.reviewAction).length;
      const totalSkipped = records.length - createdMachines.length;

      // Create ImportBatch record
      const newBatch: ImportBatch = {
        id: batchId,
        fileName: batch.fileName || 'Excel_Import.xlsx',
        fileSizeBytes: batch.fileSizeBytes || 0,
        fileHashSha256: batch.fileHashSha256 || 'sha256-unknown',
        importedBy: batch.importedBy || 'Sultan Al-Otaibi (Super Admin)',
        totalColumnsDetected: batch.totalColumnsDetected || 6,
        totalRecordsCreated: createdMachines.length,
        validCount: recordsToImport.filter(r => r.dataQualityStatus === 'VALID').length,
        reviewRequiredCount: totalRequiringReview,
        invalidRecordsCount: totalRejected,
        summaryReport: {
          totalAnalyzed: records.length,
          importedCount: createdMachines.length,
          skippedCount: totalSkipped,
          buildingsCreated: buildingsCreatedCount,
          locationsCreated: locationsCreatedCount
        },
        createdAt: timestamp
      };

      store.importBatches.unshift(newBatch);

      // Add Comprehensive Audit Log
      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        userId: 'usr-admin-01',
        user: store.users[0],
        action: 'EXCEL_BATCH_IMPORTED',
        entityName: 'ImportBatch',
        entityId: batchId,
        oldValues: {},
        newValues: {
          importBatchId: batchId,
          user: 'Sultan Al-Otaibi (Super Admin)',
          timestamp,
          sourceFile: newBatch.fileName,
          fileHash: newBatch.fileHashSha256,
          recordsApproved: totalApproved,
          recordsInserted: createdMachines.length,
          recordsSkipped: totalSkipped,
          recordsRejected: totalRejected,
          recordsRequiringReview: totalRequiringReview,
          buildingsCreated: buildingsCreatedCount,
          locationsCreated: locationsCreatedCount
        },
        ipAddress: '192.168.1.45',
        createdAt: timestamp
      });

      store.save();

      // Synchronize with backend server if available
      try {
        await apiFetch<any>('/fleet/sync', {
          method: 'POST',
          body: JSON.stringify({
            machines: store.machines,
            buildings: store.buildings,
            floors: store.floors,
            locations: store.locations,
            tickets: store.tickets,
            importBatches: store.importBatches,
            importRows: store.importRows,
            auditLogs: store.auditLogs
          })
        });
      } catch (e) {
        console.warn('Backend sync failed after import commit:', e);
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
      }

      return {
        success: true,
        batchId,
        machinesImported: createdMachines.length,
        buildingsCreated: buildingsCreatedCount,
        locationsCreated: locationsCreatedCount,
        firstMachineId: createdMachines[0]?.id || createdMachines[0]?.publicId || '',
        batch: newBatch
      };
    } catch (err: any) {
      // Transaction Rollback Safety: Restore pristine database state
      store.machines = snapshot.machines;
      store.buildings = snapshot.buildings;
      store.floors = snapshot.floors;
      store.locations = snapshot.locations;
      store.importBatches = snapshot.importBatches;
      store.importRows = snapshot.importRows;
      store.auditLogs = snapshot.auditLogs;

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        userId: 'usr-admin-01',
        user: store.users[0],
        action: 'IMPORT_BATCH_ROLLEDBACK',
        entityName: 'ImportBatch',
        entityId: batchId,
        oldValues: {},
        newValues: { error: err.message || 'Critical database error during ingestion. Transaction safely rolled back.' },
        ipAddress: '192.168.1.45',
        createdAt: timestamp
      });

      store.save();

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
      }

      throw new Error(`Import transaction failed and rolled back safely: ${err.message}`);
    }
  },

  async commitMasterBaseline(payload?: { confirmedBy?: string; notes?: string }) {
    const confirmedBy = payload?.confirmedBy || 'مدير النظام';
    const notes = payload?.notes || 'تم اعتماد وحفظ البيانات الحقيقية الحالية كنسخة أساسية دائمة للنظام';

    try {
      const res = await apiFetch<any>('/system/commit-baseline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmedBy, notes })
      });

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'BASELINE_COMMITTED',
        entityName: 'System',
        entityId: 'ROOT',
        userName: confirmedBy,
        newValues: {
          message: `تم اعتماد وحفظ البيانات الحقيقية الحالية كنسخة أساسية دائمة للنظام بواسطة ${confirmedBy}.`,
          machinesCount: store.machines.length,
          locationsCount: store.locations.length,
          techniciansCount: store.technicians.length,
          sparePartsCount: store.spareParts.length
        },
        createdAt: new Date().toISOString()
      });
      store.save();

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
      }

      return res;
    } catch (err: any) {
      console.error('commitMasterBaseline failed:', err);
      throw err;
    }
  },

  async restoreCommittedBaseline() {
    try {
      const res = await apiFetch<any>('/system/restore-committed-baseline', { method: 'POST' });
      await store.fetchServerState();

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
      }

      return res;
    } catch (err: any) {
      console.error('restoreCommittedBaseline failed:', err);
      throw err;
    }
  },

  async getBaselineStatus() {
    try {
      const res = await apiFetch<any>('/system/baseline-status', { method: 'GET' });
      return res;
    } catch {
      return {
        isCommitted: false,
        committedAt: null,
        committedBy: null,
        notes: null,
        hasCommittedBaselineOnDisk: false,
        stats: {
          machines: store.machines.length,
          buildings: store.buildings.length,
          locations: store.locations.length,
          technicians: store.technicians.length,
          spareParts: store.spareParts.length,
          tickets: store.tickets.length
        }
      };
    }
  },

  async purgeDatabase(options?: { deleteCommittedBaseline?: boolean }) {
    try {
      const res = await apiFetch<any>('/system/purge-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteCommittedBaseline: options?.deleteCommittedBaseline === true })
      });
      await store.fetchServerState();

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
      }

      return res;
    } catch {
      // Fallback local purge
      store.machines = [];
      store.buildings = [];
      store.floors = [];
      store.locations = [];
      store.tickets = [];
      store.technicians = [];
      store.categories = [];
      store.spareParts = [];
      store.suppliers = [];
      store.partRequests = [];
      store.transactions = [];
      store.importBatches = [];
      store.importRows = [];
      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'DATABASE_PURGED',
        entityName: 'System',
        entityId: 'ROOT',
        userName: 'مدير النظام',
        newValues: { message: 'تم تفريغ كافة البيانات الافتراضية بنجاح.' },
        createdAt: new Date().toISOString()
      });
      store.save();

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
      }

      return {
        success: true,
        message: 'تم تفريغ كافة البيانات بنجاح.'
      };
    }
  },

  async resetDatabase() {
    try {
      const res = await apiFetch<any>('/reset-database', { method: 'POST' });
      await store.fetchServerState();

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
      }
      return res;
    } catch {
      return this.purgeDatabase();
    }
  },

  async restoreMasterBaseline() {
    return this.restoreCommittedBaseline();
  },

  async exportFullBackup() {
    const fullSnapshot = {
      machines: store.machines,
      buildings: store.buildings,
      floors: store.floors,
      locations: store.locations,
      tickets: store.tickets,
      technicians: store.technicians,
      categories: store.categories,
      spareParts: store.spareParts,
      suppliers: store.suppliers,
      partRequests: store.partRequests,
      transactions: store.transactions,
      users: store.users,
      auditLogs: store.auditLogs,
      importBatches: store.importBatches,
      importRows: store.importRows,
      exportedAt: new Date().toISOString(),
      version: '2026.1-master-baseline'
    };

    if (typeof window !== 'undefined') {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(fullSnapshot, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `vending_fleet_backup_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    }

    return fullSnapshot;
  },

  async restoreFullBackup(backupData: any) {
    if (!backupData || typeof backupData !== 'object' || !Array.isArray(backupData.machines)) {
      throw new Error('الملف غير صالح أو لا يحتوي على بنية بيانات الماكينات المطلوبة.');
    }

    if (Array.isArray(backupData.machines)) store.machines = backupData.machines;
    if (Array.isArray(backupData.buildings)) store.buildings = backupData.buildings;
    if (Array.isArray(backupData.floors)) store.floors = backupData.floors;
    if (Array.isArray(backupData.locations)) store.locations = backupData.locations;
    if (Array.isArray(backupData.tickets)) store.tickets = backupData.tickets;
    if (Array.isArray(backupData.technicians)) store.technicians = backupData.technicians;
    if (Array.isArray(backupData.categories)) store.categories = backupData.categories;
    if (Array.isArray(backupData.spareParts)) store.spareParts = backupData.spareParts;
    if (Array.isArray(backupData.suppliers)) store.suppliers = backupData.suppliers;
    if (Array.isArray(backupData.partRequests)) store.partRequests = backupData.partRequests;
    if (Array.isArray(backupData.transactions)) store.transactions = backupData.transactions;
    if (Array.isArray(backupData.importBatches)) store.importBatches = backupData.importBatches;
    if (Array.isArray(backupData.importRows)) store.importRows = backupData.importRows;

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'BACKUP_RESTORED',
      entityName: 'System',
      entityId: 'ROOT',
      newValues: { message: `Backup restored successfully with ${store.machines.length} machines.` },
      createdAt: new Date().toISOString()
    });
    store.save();

    try {
      await apiFetch<any>('/system/restore-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backupData)
      });
    } catch {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
    }

    return {
      success: true,
      machinesCount: store.machines.length,
      ticketsCount: store.tickets.length
    };
  },

  async getDatabaseInfo() {
    return {
      totalMachines: store.machines.length,
      totalBuildings: store.buildings.filter(b => !b.isDeleted).length,
      totalFloors: store.floors.filter(f => !f.isDeleted).length,
      totalLocations: store.locations.filter(l => !l.isDeleted).length,
      totalTickets: store.tickets.length,
      totalTechnicians: store.technicians.filter(t => !t.isDeleted).length,
      totalSpareParts: store.spareParts.filter(p => !p.isDeleted).length,
      importBatchesCount: store.importBatches.length,
      hasImportedExcelMaster: store.importBatches.length > 0 || (store.machines.length > 0 && store.machines.some(m => m.importProvenance))
    };
  },

  async clearVirtualDatabase(keepTechniciansAndParts = true) {
    store.machines = [];
    store.tickets = [];
    store.buildings = [];
    store.floors = [];
    store.locations = [];
    store.importBatches = [];
    store.importRows = [];
    store.partRequests = [];
    store.transactions = [];
    if (!keepTechniciansAndParts) {
      store.spareParts = [];
      store.categories = [];
      store.suppliers = [];
    }
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'VIRTUAL_DATABASE_PURGED',
      entityName: 'System',
      entityId: 'ROOT',
      newValues: { message: 'All virtual/seed fleet records were wiped clean. Ready for real Excel master ingestion.' },
      createdAt: new Date().toISOString()
    });
    store.save();

    try {
      await apiFetch<any>('/clear-database', {
        method: 'POST',
        body: JSON.stringify({ keepTechniciansAndParts })
      });
    } catch (e) {
      console.warn('Backend sync on clear database failed:', e);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vending-fleet-data-updated'));
    }
    return { success: true };
  },

  async getSettings() {
    try {
      return await apiFetch<any>('/settings');
    } catch {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('vending_fleet_settings') : null;
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {}
      }
      return {
        criticalSla: 2,
        highSla: 4,
        mediumSla: 8,
        lowSla: 24,
        emailAlerts: true,
        smsAlerts: true,
        supportPhone: '800-123-4567',
        supportEmail: 'support@vendingfleet.com',
        supportHoursAr: 'خدمة العملاء على مدار 24 ساعة طوال أيام الأسبوع',
        supportWhatsapp: '+966-50-000-0000'
      };
    }
  },

  async updateSettings(settings: any) {
    try {
      const res = await apiFetch<any>('/settings', {
        method: 'POST',
        body: JSON.stringify(settings)
      });
      if (typeof window !== 'undefined') {
        localStorage.setItem('vending_fleet_settings', JSON.stringify(res));
      }
      return res;
    } catch {
      if (typeof window !== 'undefined') {
        localStorage.setItem('vending_fleet_settings', JSON.stringify(settings));
      }
      return settings;
    }
  },

  // Secure Cloud Location Management APIs
  async getPendingLocationProposals(limit = 50) {
    const safeLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Math.min(100, Math.trunc(Number(limit))))
      : 50;

    return await apiFetch<any>(
      `/location-management/pending?limit=${safeLimit}`
    );
  },

  async approveLocationProposal(proposalId: string) {
    if (!proposalId || !proposalId.trim()) {
      throw new Error('معرف مقترح الموقع مطلوب');
    }

    return await apiFetch<any>(
      `/location-management/proposals/${encodeURIComponent(proposalId)}/approve`,
      {
        method: 'POST'
      }
    );
  },

  async rejectLocationProposal(
    proposalId: string,
    reason: string
  ) {
    if (!proposalId || !proposalId.trim()) {
      throw new Error('معرف مقترح الموقع مطلوب');
    }

    const cleanReason = String(reason || '').trim();

    return await apiFetch<any>(
      `/location-management/proposals/${encodeURIComponent(proposalId)}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({
          reason: cleanReason
        })
      }
    );
  },

  // Hybrid Cloud & Sync Queue APIs
  async getCloudSettings() {
    try {
      return await apiFetch<any>('/admin/cloud-settings');
    } catch {
      return {
        publicQrBaseUrl: (import.meta as any).env?.VITE_PUBLIC_QR_BASE_URL || '',
        cloudApiUrl: (import.meta as any).env?.VITE_CLOUD_API_URL || '',
        gpsRadiusMeters: 100,
        syncMode: 'HYBRID',
        storageProvider: 'LOCAL_DISK'
      };
    }
  },

  async updateCloudSettings(settings: any) {
    return await apiFetch<any>('/admin/cloud-settings', {
      method: 'POST',
      body: JSON.stringify(settings)
    });
  },

  async getSyncPending(since?: string) {
    const url = since ? `/sync/pending?since=${encodeURIComponent(since)}` : '/sync/pending';
    return await apiFetch<{ events: any[]; pendingCount: number; serverTime: string }>(url);
  },

  async acknowledgeSync(eventIds: string[]) {
    return await apiFetch<any>('/sync/acknowledge', {
      method: 'POST',
      body: JSON.stringify({ eventIds })
    });
  },

  async pushSyncEvents(events: any[]) {
    return await apiFetch<any>('/sync/push', {
      method: 'POST',
      body: JSON.stringify({ events })
    });
  }
};

