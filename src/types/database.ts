/**
 * Vending Machine Fleet Management & Maintenance Platform
 * TypeScript Database Entity Definitions (Mirroring PostgreSQL Schema)
 */

export type UserRole = 
  | 'SUPER_ADMIN' 
  | 'ADMIN' 
  | 'MANAGEMENT' 
  | 'MAINTENANCE_MANAGER' 
  | 'TECHNICIAN' 
  | 'WAREHOUSE_OFFICER'
  | 'WAREHOUSE' 
  | 'FACILITY_MANAGER'
  | 'VIEWER';

export type MachineStatus = 
  | 'OPERATIONAL' 
  | 'WARNING' 
  | 'UNDER_MAINTENANCE' 
  | 'OUT_OF_SERVICE' 
  | 'DEACTIVATED'
  | 'DECOMMISSIONED' 
  | 'WAREHOUSE_BACKUP'
  | 'RELOCATING';

export type DataQualityStatus = 
  | 'VALID' 
  | 'REVIEW_REQUIRED' 
  | 'INVALID' 
  | 'CORRECTED';

export type TicketSource = 
  | 'CUSTOMER_QR' 
  | 'QR_CUSTOMER'
  | 'WHATSAPP' 
  | 'PHONE' 
  | 'MANUAL' 
  | 'SYSTEM_ALERT' 
  | 'IMPORT'
  | 'WEB';

export type TicketStatus = 
  | 'NEW' 
  | 'TRIAGED' 
  | 'ASSIGNED' 
  | 'IN_PROGRESS' 
  | 'WAITING_FOR_PART' 
  | 'WAITING_FOR_CUSTOMER' 
  | 'RESOLVED' 
  | 'VERIFIED' 
  | 'CLOSED' 
  | 'CANCELLED';

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type FaultCategory = 
  | 'PAYMENT' 
  | 'POS' 
  | 'CARD_REJECTED'
  | 'CARD_POS'
  | 'CARD_READER' 
  | 'CASH_ACCEPTOR' 
  | 'PRODUCT_SELECTION'
  | 'PRODUCT_NOT_DISPENSED'
  | 'PRODUCT_DISPENSING' 
  | 'WRONG_PRODUCT'
  | 'OUT_OF_STOCK'
  | 'NO_PRODUCT'
  | 'MOTOR' 
  | 'SENSOR' 
  | 'DISPLAY' 
  | 'TOUCH_SCREEN' 
  | 'POWER' 
  | 'NETWORK' 
  | 'TEMPERATURE' 
  | 'REFRIGERATION' 
  | 'LEAK'
  | 'DOOR' 
  | 'COIN_SYSTEM' 
  | 'SOFTWARE' 
  | 'MECHANICAL' 
  | 'OTHER';

export type TechnicianStatus = 'AVAILABLE' | 'BUSY' | 'OFFLINE' | 'ON_LEAVE' | 'INACTIVE';

export type InventoryTransactionType = 
  | 'RECEIVE' 
  | 'ISSUE' 
  | 'RETURN' 
  | 'ADJUSTMENT' 
  | 'TRANSFER' 
  | 'SCRAP';

export type TransactionType = InventoryTransactionType;

export type PartRequestStatus = 
  | 'PENDING'
  | 'REQUESTED' 
  | 'APPROVED' 
  | 'ORDERED' 
  | 'RECEIVED' 
  | 'ISSUED' 
  | 'REJECTED' 
  | 'CANCELLED';

export type NotificationType = 
  | 'TICKET_CREATED' 
  | 'TICKET_ASSIGNED' 
  | 'TICKET_ESCALATED' 
  | 'LOW_STOCK_WARNING' 
  | 'PART_REQUEST_PENDING' 
  | 'SYSTEM_ALERT';

export interface User {
  id: string;
  email: string;
  fullName: string;
  name?: string;
  phone?: string;
  role: UserRole;
  password?: string;
  isActive: boolean;
  isDeleted?: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Building {
  id: string;
  name: string;
  nameAr?: string;
  code?: string;
  address?: string;
  city?: string;
  district?: string;
  districtAr?: string;
  street?: string;
  streetAr?: string;
  floors?: Floor[];
  latitude?: number | null;
  longitude?: number | null;
  locationSource?: LocationSource;
  locationStatus?: LocationStatus;
  locationNote?: string;
  locationUpdatedAt?: string;
  locationUpdatedByActorId?: string;
  locationUpdatedByActorName?: string;
  isActive?: boolean;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletionReason?: string;
  deactivatedAt?: string;
  deactivatedBy?: string;
  deactivationReason?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Floor {
  id: string;
  buildingId: string;
  floorNumber?: number | string;
  floorName: string;
  floorNameAr?: string;
  name?: string;
  nameAr?: string;
  levelOrder: number;
  isActive?: boolean;
  isDeleted?: boolean;
  createdAt: string;
}

export interface Location {
  id: string;
  buildingId: string;
  floorId?: string;
  areaZone: string;
  areaZoneAr?: string;
  fullDescription: string;
  originalRawText?: string;
  isActive: boolean;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletionReason?: string;
  deactivatedAt?: string;
  deactivatedBy?: string;
  deactivationReason?: string;
  building?: Building;
  floor?: Floor;
  createdAt: string;
  updatedAt?: string;
}

export interface MachineModel {
  id: string;
  modelName: string;
  manufacturer: string;
  category: string;
  specifications: Record<string, any>;
}

export interface ImportProvenance {
  importBatchId: string;
  sourceFile: string;
  sourceSheet: string;
  sourceRow: number;
  sourceColumn?: number | string;
  originalSourceValues?: Record<string, any>;
  initialQualityAssessment?: string;
  normalizedAt?: string;
  importedBy?: string;
  importedAt?: string;
}

export interface ChronicFailureConfig {
  repeatedFailuresThreshold: number; // e.g. 3
  timeWindowDays: number; // e.g. 30
  downtimeHoursThreshold: number; // e.g. 48
  criticalTicketsThreshold: number; // e.g. 2
}

export type LocationSource =
  | 'NONE'
  | 'MANUAL_ENTRY'
  | 'MAP_PICKER' // Legacy compatibility only (deprecated: normalized to MAP_SELECTION on write)
  | 'MAP_SELECTION' // Canonical map-selection source
  | 'DEVICE_GPS'
  | 'TECHNICIAN_PROPOSAL_APPROVED'
  | 'BUILDING_LOCATION_REFERENCE'
  | 'FIELD_CHECKIN'
  | 'IMPORT'
  | 'API'
  | 'FUTURE_DEVICE';

export type LocationStatus =
  | 'LOCATION_NOT_CONFIGURED'
  | 'GPS_CONFIGURED'
  | 'GPS_VERIFIED'
  | 'GPS_FAILED_DISTANCE'
  | 'GPS_FAILED_ACCURACY'
  | 'COORDINATES_MISSING'
  | 'QR_CONFIRMED_GPS_UNAVAILABLE'
  | 'PENDING_LOCATION_APPROVAL'
  | 'MANUAL_EXCEPTION_APPROVED';

export interface Machine {
  id: string;
  publicId: string;
  publicQrId?: string; // Legacy public QR ID
  publicQrToken?: string; // Secure, non-sequential, cryptographically random public token
  machineNumber: string;
  serialNumber?: string | null;
  allowDuplicateSerialException?: boolean;
  modelId?: string;
  model?: MachineModel | string;
  machineType: string;
  buildingId?: string;
  floorId?: string;
  locationId?: string;
  sideZone?: string;
  status: MachineStatus;
  dataQualityStatus: DataQualityStatus;
  qualityNotes?: string;
  healthScore: number;
  healthStatus?: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'OFFLINE' | 'DEGRADED';
  isChronicFailure?: boolean;
  chronicFailureReason?: string;
  installationDate?: string;
  lastMaintenanceAt?: string;
  lastFaultAt?: string;
  nextMaintenanceDue?: string;
  machineLatitude?: number;
  machineLongitude?: number;
  latitude?: number;
  longitude?: number;
  locationSource?: LocationSource;
  locationStatus?: LocationStatus;
  locationNote?: string;
  locationUpdatedAt?: string;
  locationUpdatedByActorId?: string;
  locationUpdatedByActorName?: string;
  qrCodeUrl?: string;
  qrGeneratedAt?: string;
  notes?: string;
  importProvenance?: ImportProvenance;
  isDeleted?: boolean;
  currentLocation?: Location;
  createdAt: string;
  updatedAt: string;
}

export interface QRCodeEntity {
  id: string;
  machineId: string;
  publicUrl: string;
  qrSvg?: string;
  scanCount: number;
  lastScannedAt?: string;
  createdAt: string;
}

export type ImportStep = 
  | 'UPLOAD' 
  | 'ANALYZE' 
  | 'MAP' 
  | 'VALIDATE' 
  | 'PREVIEW' 
  | 'CONFIRM' 
  | 'IMPORT' 
  | 'REPORT';

export type DataQualityIssueCode = 
  | 'MISSING_SERIAL'
  | 'SUSPICIOUS_SERIAL'
  | 'DUPLICATE_MACHINE_NUMBER'
  | 'DUPLICATE_MACHINE_IN_BATCH'
  | 'DUPLICATE_MACHINE_IN_DB'
  | 'DUPLICATE_SERIAL_IN_BATCH'
  | 'DUPLICATE_SERIAL_IN_DB'
  | 'SERIAL_CONFLICT'
  | 'NEW_REFERENCE_ENTITY'
  | 'INVALID_MACHINE_NUMBER'
  | 'SUSPICIOUS_PLACEHOLDER'
  | 'UNKNOWN_LOCATION'
  | 'UNKNOWN_BUILDING'
  | 'INCONSISTENT_NAME'
  | 'UNMAPPED_COLUMN'
  | 'AMBIGUOUS_DATA';

export type ReviewResolutionAction = 
  | 'APPROVE'
  | 'APPROVE_WITH_NULL_SERIAL'
  | 'CORRECT_MACHINE_NUMBER'
  | 'CORRECT_SERIAL'
  | 'REJECT'
  | 'SKIP_FOR_LATER';

export type SerialVerificationStatus = 
  | 'VERIFIED'
  | 'PENDING_PHYSICAL_VERIFICATION'
  | 'UNVERIFIED';

export interface ReferenceEntityReconciliation {
  type: 'BUILDING' | 'LOCATION';
  name: string;
  parentBuilding?: string;
  floorName?: string;
  status: 'EXISTS' | 'NEW_REFERENCE_ENTITY';
  approved: boolean;
  machineCount?: number;
  isNew?: boolean;
  matchedId?: string;
}

export interface DataQualityIssue {
  code: DataQualityIssueCode;
  message: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  column?: string;
  rawValue?: string;
  suggestedCorrection?: string;
}

export interface SourceCoordinates {
  sourceFile: string;
  sourceSheet: string;
  sourceColumn: string;
  sourceRow: number;
}

export interface RawMachineRecord {
  originalMachineNumber: string;
  originalSerialNumber: string;
  originalBuilding: string;
  originalLocation: string;
  originalFloorArea?: string;
  originalSideZone?: string;
  originalType?: string;
  originalStatus?: string;
  coordinates: SourceCoordinates;
}

export interface NormalizedMachineRecord {
  id: string;
  rowIndex: number;
  raw: RawMachineRecord;
  machineNumber: string;
  serialNumber?: string | null; // preserved as null/empty if missing, NEVER invented
  buildingName: string;
  buildingCode?: string;
  locationName: string;
  floorName?: string;
  sideZone?: string;
  areaZone?: string;
  machineType: string;
  status: MachineStatus;
  dataQualityStatus: DataQualityStatus;
  healthScore: number;
  issues: DataQualityIssue[];
  reconciliationCategory?: 'NEW' | 'MATCH' | 'UPDATE_CANDIDATE' | 'DUPLICATE' | 'CONFLICT' | 'INVALID';
  reviewAction?: ReviewResolutionAction;
  reviewNotes?: string;
  recommendedAction?: string;
  serialVerificationStatus?: SerialVerificationStatus;
  isDuplicateInBatch?: boolean;
  isDuplicateInDb?: boolean;
  isSuspiciousSerial?: boolean;
  isMissingSerial?: boolean;
  isSerialConflict?: boolean;
  isDuplicateMachineNumber?: boolean;
  isNewReferenceBuilding?: boolean;
  isNewReferenceLocation?: boolean;
  userEdited?: boolean;
}

export interface HorizontalBlockMapping {
  blockName: string;
  machineNumberCol: string;
  serialNumberCol: string;
  buildingCol?: string;
  locationCol?: string;
  floorCol?: string;
  sideZoneCol?: string;
  typeCol?: string;
  statusCol?: string;
  machineColIdx?: number;
  serialColIdx?: number;
  buildingColIdx?: number;
  locationColIdx?: number;
  typeColIdx?: number;
  statusColIdx?: number;
}

export interface ColumnMappingConfig {
  sheetName: string;
  isLayoutHorizontal: boolean;
  headerRowIndex: number;
  dataStartRowIndex: number;
  machineNumberCol: string;
  serialNumberCol: string;
  buildingCol: string;
  locationCol: string;
  floorCol?: string;
  sideZoneCol?: string;
  typeCol?: string;
  statusCol?: string;
  horizontalBlocks?: HorizontalBlockMapping[];
}

export interface SheetAnalysisResult {
  sheetName: string;
  totalRows: number;
  totalCols: number;
  previewRows: any[][];
  detectedHeaderRow: number;
  detectedColumns: string[];
  suggestedMapping: ColumnMappingConfig;
  detectedLayout: 'STANDARD_VERTICAL' | 'HORIZONTAL_BLOCKS' | 'MULTI_SECTION';
  estimatedRecordsCount: number;
}

export interface WorkbookAnalysisResult {
  fileName: string;
  fileSizeBytes: number;
  fileHashSha256: string;
  sheets: SheetAnalysisResult[];
  activeSheetName: string;
  totalEstimatedRecords: number;
  detectedSummary?: {
    totalMachines?: number;
    activeCount?: number;
    underMaintenanceCount?: number;
  };
}

export interface BatchValidationSummary {
  totalRecords: number;
  sourceMachineCount?: number;
  validCount: number;
  reviewRequiredCount: number;
  invalidCount: number;
  duplicateMachinesCount: number;
  duplicateSerialsCount: number;
  serialConflictsCount?: number;
  missingSerialsCount: number;
  suspiciousSerialsCount: number;
  unknownLocationsCount: number;
  inconsistentNamesCount: number;
  activeCount?: number;
  underMaintenanceCount?: number;
  newCount?: number;
  existingCount?: number;
  updateCandidateCount?: number;
  duplicatesCount?: number;
  conflictCount?: number;
  newReferenceBuildingsCount?: number;
  newReferenceLocationsCount?: number;
  referenceEntities?: ReferenceEntityReconciliation[];
  detectedSummary?: {
    totalMachines?: number;
    activeCount?: number;
    underMaintenanceCount?: number;
  };
  records: NormalizedMachineRecord[];
}

export interface ImportCommitOptions {
  createMissingBuildings: boolean;
  createMissingLocations: boolean;
  importReviewRequired: boolean;
  skipInvalid: boolean;
  overwriteDuplicates: boolean;
  allowPartialImport?: boolean;
  skipReviewRequired?: boolean;
  replaceEntireDatabase?: boolean;
}

export interface ImportBatch {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  fileHashSha256: string;
  importedBy?: string;
  totalColumnsDetected: number;
  totalRecordsCreated: number;
  validCount?: number;
  reviewRequiredCount: number;
  invalidRecordsCount: number;
  summaryReport: Record<string, any>;
  createdAt: string;
}

export interface ImportRowEntity {
  id: string;
  importId: string;
  sourceSheet: string;
  sourceColumn: string;
  sourceRow: number;
  originalMachineNumber?: string;
  originalSerialNumber?: string;
  originalBuilding?: string;
  originalLocation?: string;
  normalizedMachineId?: string;
  normalizedLocationId?: string;
  dataQualityStatus: DataQualityStatus;
  detectedIssues: Array<{
    code: string;
    message: string;
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
    rawValue?: string;
  }>;
  createdAt: string;
}

export interface TechnicianKPIs {
  technicianId: string;
  responseTimeMinutes: number; // Average response/acknowledgment time in minutes
  repairTimeMinutes: number;   // Average repair/resolution time (MTTR) in minutes
  completedTickets: number;    // Count of resolved/closed tickets
  firstTimeFixRate: number;    // Percentage (0 - 100)
  slaComplianceRate: number;   // Percentage (0 - 100)
  activeTicketsCount: number;
  totalLaborMinutes: number;
  partsReplacedCount: number;
  rating?: number;
}

export interface Technician {
  id: string;
  userId?: string;
  user?: User;
  employeeCode: string;
  fullName?: string;
  fullNameAr?: string;
  email?: string;
  phone?: string;
  phoneNumber?: string;
  specialization?: string;
  maxDailyCapacity?: number;
  maxActiveTickets?: number;
  status: TechnicianStatus;
  skills?: string[];
  assignedTickets?: Ticket[];
  assignedRegion?: string;
  kpis?: TechnicianKPIs;
  isActive?: boolean;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletionReason?: string;
  deactivatedAt?: string;
  deactivatedBy?: string;
  deactivationReason?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface TicketAttachment {
  id: string;
  ticketId?: string;
  fileName: string;
  fileType?: string;
  fileUrl: string;
  fileSize?: number;
  uploadedBy?: string;
  uploaderRole?: string;
  caption?: string;
  createdAt?: string;
}

export interface TicketNote {
  id: string;
  ticketId: string;
  authorName: string;
  authorRole?: string;
  authorAvatar?: string;
  content: string;
  isInternal?: boolean;
  createdAt: string;
}

export interface TicketTimelineItem {
  id: string;
  ticketId: string;
  timestamp: string;
  technicianName?: string;
  technicianCode?: string;
  technicianId?: string;
  action: 
    | 'CREATED'
    | 'TRIAGED'
    | 'ASSIGNED'
    | 'ACCEPTED'
    | 'WORK_STARTED'
    | 'ACTION_ADDED'
    | 'PHOTO_UPLOADED'
    | 'NOTE_ADDED'
    | 'PART_REQUESTED'
    | 'PART_APPROVED'
    | 'PO_PLACED'
    | 'PART_RECEIVED_AVAILABLE'
    | 'PART_DISPATCHED_TO_FIELD'
    | 'PART_RECEIVED'
    | 'RESOLVED'
    | 'VERIFIED'
    | 'CLOSED'
    | 'STATUS_CHANGE';
  actionLabel?: string;
  description: string;
  part?: {
    partNumber: string;
    name: string;
    quantity: number;
    unitCost?: number;
    status?: string;
  };
  attachment?: {
    id: string;
    fileName: string;
    fileUrl: string;
    fileType?: string;
    caption?: string;
  };
  metadata?: Record<string, any>;
}

export interface TechnicianCheckInRecord {
  id: string;
  ticketId: string;
  technicianId: string;
  technicianName?: string;
  machineToken: string;
  machineNumber?: string;
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  distanceMeters?: number | null;
  status: 'GPS_VERIFIED' | 'GPS_FAILED' | 'GPS_UNAVAILABLE' | 'MANUAL_EXCEPTION';
  manualExceptionReason?: string;
  approvedBy?: string;
  fieldExceptionId?: string | null;
}

export interface FunctionalTestRecord {
  status: 'PASSED' | 'FAILED' | 'NOT_REQUIRED';
  testType?: 'PAYMENT' | 'DISPENSING' | 'COOLING' | 'DISPLAY' | 'NETWORK' | 'OPERATIONAL' | 'ALL';
  notes?: string;
  performedBy?: string;
  performedAt?: string;
}

export interface MaintenanceEvidenceRecord {
  id: string;
  ticketId: string;
  technicianId: string;
  evidenceType: 'BEFORE_PHOTO' | 'AFTER_PHOTO' | 'DIAGNOSTIC' | 'COMPONENT' | 'SERIAL_PART' | 'OTHER';
  fileUrl: string;
  fileType: string;
  caption?: string;
  uploadStatus: 'UPLOADED' | 'SYNCED' | 'PENDING';
  createdAt: string;
}

export interface CloudSyncEvent {
  id: string;
  eventType: 'CUSTOMER_REPORT' | 'TECHNICIAN_CHECKIN' | 'MAINTENANCE_ACTION' | 'EVIDENCE_UPLOAD' | 'PART_REQUEST' | 'FUNCTIONAL_TEST' | 'TICKET_STATUS_UPDATE' | 'MACHINE_CREATED' | 'MACHINE_UPDATED' | 'MACHINE_DELETED';
  aggregateType: 'TICKET' | 'MACHINE' | 'PART_REQUEST';
  aggregateId: string;
  cloudReportId?: string;
  machinePublicToken: string;
  payload: any;
  createdAt: string;
  processedAt?: string | null;
  syncStatus: 'PENDING' | 'PROCESSING' | 'SYNCED' | 'FAILED';
  retryCount: number;
  lastError?: string | null;
}

export interface PublicMachineSummary {
  publicQrToken: string;
  machineType: string;
  buildingName: string;
  locationDescription: string;
  status: MachineStatus;
  lastFaultAt?: string;
}

export interface PublicTicketTracking {
  ticketNumber: string;
  trackingToken: string;
  status: TicketStatus;
  category: FaultCategory;
  createdAt: string;
  updatedAt?: string;
  machineSummary: {
    buildingName: string;
    locationDescription: string;
    machineType: string;
  };
}

export interface Ticket {
  id: string;
  ticketNumber: string;
  cloudReportId?: string; // Idempotency key from Cloud QR report
  publicTrackingToken?: string; // Public tracking token for customers
  title?: string;
  titleAr?: string;
  machineId: string;
  machine?: Machine;
  locationId?: string;
  location?: Location;
  source?: TicketSource;
  category: FaultCategory;
  faultType?: string;
  priority: TicketPriority;
  status: TicketStatus;
  description: string;
  descriptionAr?: string;
  reporterName?: string;
  reporterPhone?: string;
  reporterEmail?: string;
  reportedBy?: string;
  assignedTechnicianId?: string;
  assignedTechnician?: Technician;
  isRecurring?: boolean;
  recurringOccurrenceCount?: number;
  gpsVerificationStatus?: 'GPS_VERIFIED' | 'GPS_FAILED' | 'GPS_UNAVAILABLE' | 'MANUAL_EXCEPTION';
  gpsDistanceMeters?: number;
  technicianCheckIn?: TechnicianCheckInRecord;
  functionalTest?: FunctionalTestRecord;
  evidence?: MaintenanceEvidenceRecord[];
  slaDueAt?: string;
  triagedAt?: string;
  acknowledgedAt?: string;
  startedAt?: string;
  resolvedAt?: string;
  verifiedAt?: string;
  closedAt?: string;
  isArchived?: boolean;
  archivedAt?: string;
  archivedBy?: string;
  archivedReason?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletionReason?: string;
  rootCause?: string;
  resolutionSummary?: string;
  totalPartsCost?: number;
  timeline?: TicketTimelineItem[];
  attachments?: TicketAttachment[];
  notes?: TicketNote[];
  maintenanceActions?: MaintenanceAction[];
  statusHistory?: TicketStatusHistory[];
  createdAt: string;
  updatedAt?: string;
}

export interface TicketStatusHistory {
  id: string;
  ticketId: string;
  previousStatus?: TicketStatus;
  newStatus: TicketStatus;
  changedBy?: string;
  changedByUser?: User;
  comment?: string;
  createdAt: string;
}

export interface MaintenanceAction {
  id: string;
  ticketId: string;
  technicianId?: string;
  technician?: Technician;
  actionType?: string;
  actionTaken?: string;
  description: string;
  rootCause?: string;
  partsReplaced?: Array<{ partNumber: string; name: string; quantity: number; unitCost: number }>;
  partsUsed?: Array<{ sparePart?: SparePart; partId?: string; quantity: number; unitCostAtUse: number }>;
  workDurationMinutes?: number;
  durationMinutes?: number;
  performedAt?: string;
  createdAt?: string;
}

export interface SparePartCategory {
  id: string;
  name: string;
  nameAr?: string;
  description?: string;
  partsCount?: number;
  totalValue?: number;
}

export interface SparePart {
  id: string;
  partNumber: string;
  name: string;
  nameAr?: string;
  categoryId?: string;
  category?: string | SparePartCategory;
  manufacturer?: string;
  supplierId?: string;
  supplier?: Supplier;
  compatibleModels?: string[];
  unit?: string;
  currentQuantity: number;
  minimumQuantity?: number;
  minStockLevel?: number;
  maxStockLevel?: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  unitCost: number;
  totalValue?: number;
  storageLocation?: string;
  barcode?: string;
  leadTimeDays?: number;
  status?: string;
  isActive?: boolean;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletionReason?: string;
  deactivatedAt?: string;
  deactivatedBy?: string;
  deactivationReason?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface InventoryTransaction {
  id: string;
  partId?: string;
  sparePartId?: string;
  part?: SparePart;
  sparePart?: SparePart;
  transactionType: InventoryTransactionType;
  quantity?: number;
  quantityDelta: number;
  balanceBefore?: number;
  balanceAfter: number;
  referenceTicketId?: string;
  referenceTicketNumber?: string;
  referenceNumber?: string;
  machineId?: string;
  machineNumber?: string;
  sourceLocation?: string;
  targetLocation?: string;
  performedBy?: string;
  performedByRole?: string;
  unitCost?: number;
  unitPrice?: number;
  totalCost?: number;
  notes?: string;
  createdAt: string;
}

export interface SparePartRequestTimelineItem {
  status: PartRequestStatus;
  timestamp: string;
  actor?: string;
  comment?: string;
}

export interface SparePartRequest {
  id: string;
  requestNumber?: string;
  ticketId?: string;
  ticket?: Ticket;
  ticketNumber?: string;
  machineId?: string;
  machine?: Machine;
  machineNumber?: string;
  technicianId?: string;
  technician?: Technician;
  technicianName?: string;
  partId?: string;
  sparePartId?: string;
  part?: SparePart;
  sparePart?: SparePart;
  partNumber?: string;
  partName?: string;
  isCustomNonCatalog?: boolean;
  estimatedCost?: number;
  unitCost?: number;
  storageLocation?: string;
  category?: string;
  quantity: number;
  priority?: TicketPriority;
  status: PartRequestStatus;
  isInStock?: boolean;
  supplierId?: string;
  supplier?: Supplier;
  poNumber?: string;
  expectedDeliveryDate?: string;
  approvedBy?: string;
  approvedAt?: string;
  orderedBy?: string;
  orderedAt?: string;
  receivedBy?: string;
  receivedAt?: string;
  issuedBy?: string;
  issuedAt?: string;
  rejectedReason?: string;
  rejectionReason?: string;
  notes?: string;
  reason?: string;
  isCancelled?: boolean;
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletionReason?: string;
  timeline?: SparePartRequestTimelineItem[];
  createdAt: string;
  updatedAt?: string;
}

export type PartRequest = SparePartRequest;

export interface MachinePartHistoryRecord {
  id: string;
  machineId: string;
  machineNumber: string;
  partId: string;
  partNumber: string;
  partName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  ticketId: string;
  ticketNumber: string;
  technicianId?: string;
  technicianName?: string;
  installedAt: string;
  installedBy?: string;
  reason?: string;
}

export interface PartUsageRecord {
  id: string;
  partId: string;
  partNumber: string;
  partName: string;
  transactionType: InventoryTransactionType;
  quantity: number;
  balanceAfter: number;
  unitCost: number;
  ticketId?: string;
  ticketNumber?: string;
  machineId?: string;
  machineNumber?: string;
  performedBy?: string;
  notes?: string;
  date: string;
}

export interface Supplier {
  id: string;
  code?: string;
  supplierCode?: string;
  name: string;
  nameAr?: string;
  contactName?: string;
  contactPerson?: string;
  contactPersonAr?: string;
  email: string;
  phone?: string;
  address?: string;
  addressAr?: string;
  leadTimeDays: number;
  paymentTerms?: string;
  rating?: number;
  suppliedPartsCount?: number;
  isActive?: boolean;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletionReason?: string;
  deactivatedAt?: string;
  deactivatedBy?: string;
  deactivationReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuditLog {
  id: string;
  userId?: string;
  user?: User;
  userName?: string;
  actorName?: string;
  action: string;
  entityType?: string;
  entityName?: string;
  entityId: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  changes?: Record<string, any>;
  reason?: string;
  ipAddress?: string;
  timestamp?: string;
  createdAt: string;
}

// ==========================================
// PHASE 14: CUSTOMER FAULT & WHATSAPP TYPES
// ==========================================

export type CommunicationChannel = 'WEB' | 'WHATSAPP' | 'PHONE' | 'INTERNAL' | 'EMAIL';
export type CommunicationDirection = 'INBOUND' | 'OUTBOUND';
export type CommunicationDeliveryStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

export interface TicketCommunication {
  id: string;
  ticketId: string;
  ticketNumber?: string;
  machineNumber?: string;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  sender: string;
  senderPhone?: string;
  recipient?: string;
  recipientPhone?: string;
  message: string;
  attachments?: string[];
  deliveryStatus: CommunicationDeliveryStatus;
  externalMessageId?: string;
  timestamp: string;
  metadata?: Record<string, any>;
  createdAt?: string;
}

export interface SLAPolicy {
  responseMinutes: number;   // Expected response / triage window
  resolutionMinutes: number; // Expected full resolution / closure window
}

export interface SLAConfiguration {
  CRITICAL: SLAPolicy;
  HIGH: SLAPolicy;
  MEDIUM: SLAPolicy;
  LOW: SLAPolicy;
}

export type SLAStatus = 'WITHIN_SLA' | 'AT_RISK' | 'BREACHED' | 'MET';

export interface TicketSLAResult {
  responseDueAt: string;
  resolutionDueAt: string;
  responseElapsedMinutes: number;
  resolutionElapsedMinutes: number;
  isResponseBreached: boolean;
  isResolutionBreached: boolean;
  slaStatus: SLAStatus;
  remainingMinutes?: number;
}

export interface MachineFaultAutoTransitionRule {
  category: FaultCategory;
  targetStatus: MachineStatus; // e.g. WARNING or UNDER_MAINTENANCE
  condition?: 'ANY_REPORT' | 'CRITICAL_ONLY' | 'REPEATED_30_DAYS';
  priority?: TicketPriority;
}

export interface MachineFaultAutoTransitionConfig {
  enabled: boolean;
  rules: MachineFaultAutoTransitionRule[];
}

export interface WhatsAppMessagePayload {
  to: string;
  message: string;
  mediaUrl?: string;
  previewUrl?: boolean;
}

export interface WhatsAppTemplatePayload {
  to: string;
  templateName: string;
  language: string;
  components?: any[];
}

export interface WhatsAppProviderResult {
  success: boolean;
  messageId?: string;
  error?: string;
  timestamp?: string;
  rawResponse?: any;
}

export interface IWhatsAppProvider {
  name: string;
  sendMessage(to: string, message: string): Promise<WhatsAppProviderResult>;
  sendTemplate(to: string, templateName: string, language: string, components?: any[]): Promise<WhatsAppProviderResult>;
  sendTicketNotification(to: string, ticketNumber: string, machineNumber: string, status: string, notes?: string): Promise<WhatsAppProviderResult>;
}

export interface WhatsAppWebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'image' | 'button' | 'interactive' | string;
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256?: string; caption?: string };
}

export interface WhatsAppWebhookEvent {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: { name: string };
          wa_id: string;
        }>;
        messages?: WhatsAppWebhookMessage[];
      };
      field: string;
    }>;
  }>;
}

export type NotificationChannel = 'EMAIL' | 'WHATSAPP' | 'WEB_PUSH' | 'IN_APP';

export interface NotificationPayload {
  channels: NotificationChannel[];
  recipient: {
    phone?: string;
    email?: string;
    userId?: string;
    name?: string;
  };
  title: string;
  body: string;
  data?: Record<string, any>;
  ticketNumber?: string;
  machineNumber?: string;
}

export interface SafePublicMachine {
  publicQrId: string;
  machineNumber: string;
  machineType: string;
  buildingName: string;
  locationDescription: string;
  status: MachineStatus;
}

export interface SafeCustomerTicketStatus {
  ticketNumber: string;
  machineNumber: string;
  machineType: string;
  building: string;
  location: string;
  category: FaultCategory;
  priority: TicketPriority;
  statusText: 'Received' | 'Assigned' | 'Technician On The Way' | 'Under Maintenance' | 'Resolved' | 'Closed';
  rawStatus: TicketStatus;
  createdAt: string;
  estimatedResolutionWindow: string;
  slaStatus: SLAStatus;
  simplifiedTimeline: Array<{
    title: string;
    timestamp: string;
    completed: boolean;
  }>;
}

export interface CustomerReportAnalytics {
  reportsToday: number;
  reportsThisWeek: number;
  reportsThisMonth: number;
  qrReportsCount: number;
  whatsappReportsCount: number;
  webReportsCount: number;
  mostReportedMachines: Array<{ machineNumber: string; building: string; count: number }>;
  mostCommonFaults: Array<{ category: FaultCategory; label: string; count: number; percentage: number }>;
  avgResponseTimeMinutes: number;
  avgResolutionTimeMinutes: number;
  slaComplianceRate: number;
  slaViolationsCount: number;
}

export interface FaultReportSubmission {
  publicQrId: string;
  category: FaultCategory;
  description: string;
  reporterName?: string;
  reporterPhone?: string;
  reporterEmail?: string;
  attachments?: string[];
  idempotencyKey?: string;
}
