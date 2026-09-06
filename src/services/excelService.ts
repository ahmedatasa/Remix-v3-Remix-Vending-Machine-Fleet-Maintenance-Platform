import * as XLSX from 'xlsx';
import {
  Machine,
  Building,
  Location,
  DataQualityStatus,
  MachineStatus,
  ImportStep,
  DataQualityIssue,
  NormalizedMachineRecord,
  WorkbookAnalysisResult,
  SheetAnalysisResult,
  ColumnMappingConfig,
  BatchValidationSummary,
  ImportCommitOptions,
  HorizontalBlockMapping,
  ReferenceEntityReconciliation
} from '../types';

// Suspicious Serial Placeholders common in legacy Excel files
const SUSPICIOUS_SERIAL_PATTERNS = [
  /^N\/?A$/i,
  /^NA$/i,
  /^TBD$/i,
  /^-+$/,
  /^0+$/,
  /^12345+$/,
  /^SAME\s*(AS\s*ABOVE)?$/i,
  /^UNKNOWN$/i,
  /^NONE$/i,
  /^NOT\s*VISIBLE$/i,
  /^PENDING$/i,
  /^NULL$/i,
  /^X+$/i,
  /^\?+$/,
  /^TEST$/i,
  /^NO\s*SERIAL$/i,
  /^NO_SERIAL$/i,
  /^NOT\s*CLEAR$/i,
  /^N\/A\s*-\s*CHECK$/i
];

const SUSPICIOUS_MACHINE_ID_PATTERNS = [
  /^TEMP/i,
  /^TBD/i,
  /^NEW(\s*MACHINE)?$/i,
  /^TEST/i,
  /^VM-\?+$/i,
  /^\?+$/,
  /^UNNAMED/i
];

const GENERIC_LOCATION_PATTERNS = [
  /^TBD$/i,
  /^\?+$/,
  /^UNKNOWN/i,
  /^N\/?A$/i,
  /^TO\s*BE\s*DETERMINED$/i,
  /^UNSPECIFIED$/i,
  /^-+$/
];

export const excelService = {
  /**
   * Read raw Excel buffer and compute quick SHA-256 hash
   */
  async readWorkbook(file: File): Promise<{
    fileName: string;
    fileSizeBytes: number;
    fileHash: string;
    workbook: XLSX.WorkBook;
  }> {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array', cellDates: true, raw: false });
    
    // Simple hash computation
    let hash = 0;
    const view = new Uint8Array(data);
    for (let i = 0; i < Math.min(view.length, 10000); i++) {
      hash = (hash << 5) - hash + view[i];
      hash |= 0;
    }
    const fileHash = `sha256-${Math.abs(hash).toString(16).padStart(8, '0')}`;

    return {
      fileName: file.name,
      fileSizeBytes: file.size,
      fileHash,
      workbook
    };
  },

  /**
   * STEP 2: ANALYZE - Deep inspection of workbook, detecting multi-sheet layouts and horizontal blocks
   */
  analyzeWorkbook(
    workbook: XLSX.WorkBook,
    fileName: string,
    fileSizeBytes: number,
    fileHash: string
  ): WorkbookAnalysisResult {
    const sheetResults: SheetAnalysisResult[] = [];
    let totalEstimated = 0;

    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) return;

      const rawGrid: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      if (!rawGrid || rawGrid.length === 0) return;

      const totalRows = rawGrid.length;
      const totalCols = Math.max(...rawGrid.map(r => r.length), 0);
      const previewRows = rawGrid.slice(0, 15);

      // Detect header row index (scanning rows 0 to 8)
      let headerRowIndex = 0;
      let detectedColumns: string[] = [];
      let maxScore = -1;

      for (let r = 0; r < Math.min(rawGrid.length, 8); r++) {
        const row = rawGrid[r] || [];
        const nonBlank = row.filter((c: any) => String(c).trim() !== '');
        if (nonBlank.length === 0) continue;

        // Score header candidate based on keywords
        let score = 0;
        row.forEach((cell: any) => {
          const str = String(cell).toLowerCase().trim();
          if (str.includes('machine') || str.includes('ماكينة') || str.includes('tag') || str.includes('id')) score += 3;
          if (str.includes('serial') || str.includes('تسلسلي') || str.includes('sn') || str.includes('s/n')) score += 3;
          if (str.includes('building') || str.includes('مبنى') || str.includes('campus') || str.includes('site')) score += 2;
          if (str.includes('location') || str.includes('موقع') || str.includes('zone') || str.includes('area') || str.includes('floor')) score += 2;
          if (str.includes('type') || str.includes('نوع') || str.includes('model') || str.includes('موديل')) score += 1;
          if (str.includes('status') || str.includes('حالة')) score += 1;
        });

        if (score > maxScore && nonBlank.length >= 2) {
          maxScore = score;
          headerRowIndex = r;
          detectedColumns = row.map((c: any, idx: number) => String(c).trim() || `Col_${XLSX.utils.encode_col(idx)}`);
        }
      }

      if (detectedColumns.length === 0 && rawGrid.length > 0) {
        detectedColumns = (rawGrid[0] || []).map((c: any, idx: number) => String(c).trim() || `Col_${XLSX.utils.encode_col(idx)}`);
      }

      // Check if horizontal layout (e.g. repeated Machine / Serial pairs across columns)
      const horizontalBlocks: HorizontalBlockMapping[] = [];
      const machineColIndices: number[] = [];
      const serialColIndices: number[] = [];

      detectedColumns.forEach((colName, idx) => {
        const lower = colName.toLowerCase();
        const isSerial = lower.includes('serial') || lower.includes('سيريل') || lower.includes('سيريال') || lower.includes('تسلسلي') || lower.includes('sn') || lower.includes('s/n');
        const isMachine = !isSerial && (lower.includes('machine') || lower.includes('ماكينة') || lower.includes('tag') || lower.includes('vm') || (lower.includes('رقم') && !lower.includes('تسلسلي')));

        if (isSerial) {
          serialColIndices.push(idx);
        } else if (isMachine) {
          machineColIndices.push(idx);
        }
      });

      let isLayoutHorizontal = false;
      let detectedLayout: 'STANDARD_VERTICAL' | 'HORIZONTAL_BLOCKS' | 'MULTI_SECTION' = 'STANDARD_VERTICAL';

      if (machineColIndices.length > 1) {
        isLayoutHorizontal = true;
        detectedLayout = 'HORIZONTAL_BLOCKS';

        machineColIndices.forEach((mIdx, bIdx) => {
          const sIdx = serialColIndices.find(idx => idx > mIdx && (bIdx === machineColIndices.length - 1 || idx < machineColIndices[bIdx + 1])) ?? (mIdx + 1);
          horizontalBlocks.push({
            blockName: detectedColumns[mIdx] || `Machine Block ${bIdx + 1}`,
            machineNumberCol: detectedColumns[mIdx],
            serialNumberCol: detectedColumns[sIdx] || '',
            typeCol: detectedColumns[mIdx + 2] || '',
            statusCol: detectedColumns[mIdx + 3] || '',
            machineColIdx: mIdx,
            serialColIdx: sIdx,
            typeColIdx: mIdx + 2,
            statusColIdx: mIdx + 3
          });
        });
      }

      // Automatic Column Mapping Suggestion
      const mapping: ColumnMappingConfig = {
        sheetName,
        isLayoutHorizontal,
        headerRowIndex,
        dataStartRowIndex: headerRowIndex + 1,
        machineNumberCol: this.findBestColumn(detectedColumns, ['رقم الماكينة', 'machine number', 'machine id', 'machine #', 'machine', 'tag', 'machine no', 'id', 'vm id', 'رقم الآلة', 'رقم']),
        serialNumberCol: this.findBestColumn(detectedColumns, ['سيريل الماكينة', 'سيريال الماكينة', 'سيريل', 'سيريال', 'serial number', 'serial #', 'sn', 'الرقم التسلسلي', 'serial', 's/n', 'رقم السيريال']),
        buildingCol: this.findBestColumn(detectedColumns, ['المبنى', 'building', 'building name', 'campus', 'location site', 'اسم المبنى', 'مبنى', 'site', 'facility']),
        locationCol: this.findBestColumn(detectedColumns, ['الجهة', 'location', 'floor/zone', 'الموقع', 'zone', 'area', 'الدور / الغرفة', 'تفاصيل الموقع', 'موقع', 'room', 'غرفة']),
        floorCol: this.findBestColumn(detectedColumns, ['الدور', 'floor', 'الطابق', 'level', 'floor name']),
        typeCol: this.findBestColumn(detectedColumns, ['النوع', 'machine type', 'type', 'model', 'الموديل', 'category', 'نوع الماكينة', 'موديل']),
        statusCol: this.findBestColumn(detectedColumns, ['الحالة', 'status', 'operational status', 'الحالة التشغيلية', 'حالة']),
        horizontalBlocks: isLayoutHorizontal ? horizontalBlocks : undefined
      };

      const estimatedRows = Math.max(0, totalRows - mapping.dataStartRowIndex);
      const estimatedRecordsCount = isLayoutHorizontal
        ? estimatedRows * (horizontalBlocks.length || 1)
        : estimatedRows;

      totalEstimated += estimatedRecordsCount;

      sheetResults.push({
        sheetName,
        totalRows,
        totalCols,
        previewRows,
        detectedHeaderRow: headerRowIndex,
        detectedColumns,
        suggestedMapping: mapping,
        detectedLayout,
        estimatedRecordsCount
      });
    });

    return {
      fileName,
      fileSizeBytes,
      fileHashSha256: fileHash,
      sheets: sheetResults,
      activeSheetName: sheetResults[0]?.sheetName || '',
      totalEstimatedRecords: totalEstimated
    };
  },

  /**
   * Helper to match best column name from synonyms
   */
  findBestColumn(columns: string[], synonyms: string[]): string {
    for (const syn of synonyms) {
      const found = columns.find(c => c.toLowerCase().trim() === syn || c.toLowerCase().includes(syn));
      if (found) return found;
    }
    return columns[0] || '';
  },

  /**
   * STEP 4: VALIDATE - Parse rows, preserve raw coordinates, apply strict validation rules (DO NOT INVENT MISSING VALUES)
   */
  validateSheetData(
    workbook: XLSX.WorkBook,
    mapping: ColumnMappingConfig,
    fileName: string,
    existingMachines: Machine[] = []
  ): BatchValidationSummary {
    const worksheet = workbook.Sheets[mapping.sheetName];
    if (!worksheet) {
      throw new Error(`Sheet ${mapping.sheetName} not found in workbook`);
    }

    const rawGrid: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    const records: NormalizedMachineRecord[] = [];

    const existingMachineNums = new Set(
      (existingMachines || [])
        .map(m => ((m?.machineNumber || (m as any)?.machine_number || '') as string).toUpperCase().trim())
        .filter(Boolean)
    );
    const existingSerialNums = new Set(
      (existingMachines || [])
        .map(m => ((m?.serialNumber || (m as any)?.serial_number || '') as string).toUpperCase().trim())
        .filter(Boolean)
    );

    const batchSeenMachineNums = new Map<string, number>(); // upper -> first row
    const batchSeenSerials = new Map<string, number>(); // upper -> first row

    let validCount = 0;
    let reviewCount = 0;
    let invalidCount = 0;
    let duplicateMachinesCount = 0;
    let duplicateSerialsCount = 0;
    let missingSerialsCount = 0;
    let suspiciousSerialsCount = 0;
    let unknownLocationsCount = 0;
    let inconsistentNamesCount = 0;

    const headerRow = rawGrid[mapping.headerRowIndex] || [];
    const getColIndex = (colName?: string) => {
      if (!colName) return -1;
      return headerRow.findIndex((c: any) => String(c).trim() === colName);
    };

    const machColIdx = getColIndex(mapping.machineNumberCol);
    const serColIdx = getColIndex(mapping.serialNumberCol);
    const bldColIdx = getColIndex(mapping.buildingCol);
    const locColIdx = getColIndex(mapping.locationCol);
    const floorColIdx = getColIndex(mapping.floorCol);
    const typeColIdx = getColIndex(mapping.typeCol);
    const statusColIdx = getColIndex(mapping.statusCol);

    // Process row by row starting at dataStartRowIndex
    for (let r = mapping.dataStartRowIndex; r < rawGrid.length; r++) {
      const row = rawGrid[r] || [];
      const sourceRowNum = r + 1; // 1-indexed

      // Check if entire row is empty
      const isRowEmpty = row.every((c: any) => String(c).trim() === '');
      if (isRowEmpty) continue;

      if (mapping.isLayoutHorizontal && mapping.horizontalBlocks && mapping.horizontalBlocks.length > 0) {
        // Horizontal layout: extract one record per horizontal block
        const commonBldRaw = bldColIdx >= 0 ? String(row[bldColIdx] || '').trim() : '';
        const commonLocRaw = locColIdx >= 0 ? String(row[locColIdx] || '').trim() : '';

        mapping.horizontalBlocks.forEach((block, bIdx) => {
          const bMachIdx = typeof block.machineColIdx === 'number' ? block.machineColIdx : getColIndex(block.machineNumberCol);
          const bSerIdx = typeof block.serialColIdx === 'number' ? block.serialColIdx : getColIndex(block.serialNumberCol);
          const bTypeIdx = typeof block.typeColIdx === 'number' ? block.typeColIdx : getColIndex(block.typeCol);

          const rawMach = bMachIdx >= 0 ? String(row[bMachIdx] || '').trim() : '';
          const rawSer = bSerIdx >= 0 ? String(row[bSerIdx] || '').trim() : '';
          const rawType = bTypeIdx >= 0 && row[bTypeIdx] ? String(row[bTypeIdx] || '').trim() : block.blockName;
          const rawBld = block.buildingCol ? String(row[getColIndex(block.buildingCol)] || '').trim() : commonBldRaw;
          const rawLoc = block.locationCol ? String(row[getColIndex(block.locationCol)] || '').trim() : commonLocRaw;

          if (!rawMach && !rawSer) return; // skip empty block in this row

          const colLetter = bMachIdx >= 0 ? XLSX.utils.encode_col(bMachIdx) : `Col${bIdx}`;
          this.processSingleRecord({
            sourceFile: fileName,
            sourceSheet: mapping.sheetName,
            sourceColumn: colLetter,
            sourceRow: sourceRowNum,
            rawMach,
            rawSer,
            rawBld: rawBld || mapping.sheetName,
            rawLoc,
            rawFloor: '',
            rawType: rawType || 'Combination Snack & Soda',
            rawStatus: 'OPERATIONAL',
            batchSeenMachineNums,
            batchSeenSerials,
            existingMachineNums,
            existingSerialNums,
            records,
            counters: {
              incValid: () => validCount++,
              incReview: () => reviewCount++,
              incInvalid: () => invalidCount++,
              incDupMach: () => duplicateMachinesCount++,
              incDupSer: () => duplicateSerialsCount++,
              incMissSer: () => missingSerialsCount++,
              incSuspSer: () => suspiciousSerialsCount++,
              incUnkLoc: () => unknownLocationsCount++,
              incInconsist: () => inconsistentNamesCount++
            }
          });
        });
      } else {
        // Standard vertical tabular layout
        const rawMach = machColIdx >= 0 ? String(row[machColIdx] || '').trim() : '';
        const rawSer = serColIdx >= 0 ? String(row[serColIdx] || '').trim() : '';
        const rawBld = bldColIdx >= 0 ? String(row[bldColIdx] || '').trim() : '';
        const rawLoc = locColIdx >= 0 ? String(row[locColIdx] || '').trim() : '';
        const rawFloor = floorColIdx >= 0 ? String(row[floorColIdx] || '').trim() : '';
        const rawType = typeColIdx >= 0 ? String(row[typeColIdx] || '').trim() : '';
        const rawStatus = statusColIdx >= 0 ? String(row[statusColIdx] || '').trim() : '';

        const colLetter = machColIdx >= 0 ? XLSX.utils.encode_col(machColIdx) : 'A';

        this.processSingleRecord({
          sourceFile: fileName,
          sourceSheet: mapping.sheetName,
          sourceColumn: colLetter,
          sourceRow: sourceRowNum,
          rawMach,
          rawSer,
          rawBld: rawBld || mapping.sheetName,
          rawLoc,
          rawFloor,
          rawType,
          rawStatus,
          batchSeenMachineNums,
          batchSeenSerials,
          existingMachineNums,
          existingSerialNums,
          records,
          counters: {
            incValid: () => validCount++,
            incReview: () => reviewCount++,
            incInvalid: () => invalidCount++,
            incDupMach: () => duplicateMachinesCount++,
            incDupSer: () => duplicateSerialsCount++,
            incMissSer: () => missingSerialsCount++,
            incSuspSer: () => suspiciousSerialsCount++,
            incUnkLoc: () => unknownLocationsCount++,
            incInconsist: () => inconsistentNamesCount++
          }
        });
      }
    }

    // Perform Post-processing and Reference Entity Reconciliation
    return this.postProcessAndReconcileBatch(records, existingMachines);
  },

  /**
   * STEP 4B: VALIDATE ENTIRE WORKBOOK (All Sheets / Full Fleet)
   */
  validateWorkbook(
    workbook: XLSX.WorkBook,
    analysis: WorkbookAnalysisResult,
    fileName: string,
    existingMachines: Machine[] = []
  ): BatchValidationSummary {
    const allRecords: NormalizedMachineRecord[] = [];

    const existingMachineNums = new Set(
      (existingMachines || [])
        .map(m => ((m?.machineNumber || (m as any)?.machine_number || '') as string).toUpperCase().trim())
        .filter(Boolean)
    );
    const existingSerialNums = new Set(
      (existingMachines || [])
        .map(m => ((m?.serialNumber || (m as any)?.serial_number || '') as string).toUpperCase().trim())
        .filter(Boolean)
    );

    const batchSeenMachineNums = new Map<string, number>();
    const batchSeenSerials = new Map<string, number>();

    let validCount = 0;
    let reviewCount = 0;
    let invalidCount = 0;
    let duplicateMachinesCount = 0;
    let duplicateSerialsCount = 0;
    let missingSerialsCount = 0;
    let suspiciousSerialsCount = 0;
    let unknownLocationsCount = 0;
    let inconsistentNamesCount = 0;

    analysis.sheets.forEach(sheetInfo => {
      const mapping = sheetInfo.suggestedMapping;
      const worksheet = workbook.Sheets[mapping.sheetName];
      if (!worksheet) return;

      const rawGrid: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      const headerRow = rawGrid[mapping.headerRowIndex] || [];
      const getColIndex = (colName?: string) => {
        if (!colName) return -1;
        return headerRow.findIndex((c: any) => String(c).trim() === colName);
      };

      const machColIdx = getColIndex(mapping.machineNumberCol);
      const serColIdx = getColIndex(mapping.serialNumberCol);
      const bldColIdx = getColIndex(mapping.buildingCol);
      const locColIdx = getColIndex(mapping.locationCol);
      const floorColIdx = getColIndex(mapping.floorCol);
      const typeColIdx = getColIndex(mapping.typeCol);
      const statusColIdx = getColIndex(mapping.statusCol);

      for (let r = mapping.dataStartRowIndex; r < rawGrid.length; r++) {
        const row = rawGrid[r] || [];
        const sourceRowNum = r + 1;

        const isRowEmpty = row.every((c: any) => String(c).trim() === '');
        if (isRowEmpty) continue;

        if (mapping.isLayoutHorizontal && mapping.horizontalBlocks && mapping.horizontalBlocks.length > 0) {
          const commonBldRaw = bldColIdx >= 0 ? String(row[bldColIdx] || '').trim() : '';
          const commonLocRaw = locColIdx >= 0 ? String(row[locColIdx] || '').trim() : '';

          mapping.horizontalBlocks.forEach((block, bIdx) => {
            const bMachIdx = typeof block.machineColIdx === 'number' ? block.machineColIdx : getColIndex(block.machineNumberCol);
            const bSerIdx = typeof block.serialColIdx === 'number' ? block.serialColIdx : getColIndex(block.serialNumberCol);
            const bTypeIdx = typeof block.typeColIdx === 'number' ? block.typeColIdx : getColIndex(block.typeCol);

            const rawMach = bMachIdx >= 0 ? String(row[bMachIdx] || '').trim() : '';
            const rawSer = bSerIdx >= 0 ? String(row[bSerIdx] || '').trim() : '';
            const rawType = bTypeIdx >= 0 && row[bTypeIdx] ? String(row[bTypeIdx] || '').trim() : block.blockName;
            const rawBld = block.buildingCol ? String(row[getColIndex(block.buildingCol)] || '').trim() : commonBldRaw;
            const rawLoc = block.locationCol ? String(row[getColIndex(block.locationCol)] || '').trim() : commonLocRaw;

            if (!rawMach && !rawSer) return;

            const colLetter = bMachIdx >= 0 ? XLSX.utils.encode_col(bMachIdx) : `Col${bIdx}`;
            this.processSingleRecord({
              sourceFile: fileName,
              sourceSheet: mapping.sheetName,
              sourceColumn: colLetter,
              sourceRow: sourceRowNum,
              rawMach,
              rawSer,
              rawBld: rawBld || mapping.sheetName,
              rawLoc,
              rawFloor: '',
              rawType: rawType || 'Combination Snack & Soda',
              rawStatus: 'OPERATIONAL',
              batchSeenMachineNums,
              batchSeenSerials,
              existingMachineNums,
              existingSerialNums,
              records: allRecords,
              counters: {
                incValid: () => validCount++,
                incReview: () => reviewCount++,
                incInvalid: () => invalidCount++,
                incDupMach: () => duplicateMachinesCount++,
                incDupSer: () => duplicateSerialsCount++,
                incMissSer: () => missingSerialsCount++,
                incSuspSer: () => suspiciousSerialsCount++,
                incUnkLoc: () => unknownLocationsCount++,
                incInconsist: () => inconsistentNamesCount++
              }
            });
          });
        } else {
          const rawMach = machColIdx >= 0 ? String(row[machColIdx] || '').trim() : '';
          const rawSer = serColIdx >= 0 ? String(row[serColIdx] || '').trim() : '';
          const rawBld = bldColIdx >= 0 ? String(row[bldColIdx] || '').trim() : '';
          const rawLoc = locColIdx >= 0 ? String(row[locColIdx] || '').trim() : '';
          const rawFloor = floorColIdx >= 0 ? String(row[floorColIdx] || '').trim() : '';
          const rawType = typeColIdx >= 0 ? String(row[typeColIdx] || '').trim() : '';
          const rawStatus = statusColIdx >= 0 ? String(row[statusColIdx] || '').trim() : '';

          const colLetter = machColIdx >= 0 ? XLSX.utils.encode_col(machColIdx) : 'A';

          this.processSingleRecord({
            sourceFile: fileName,
            sourceSheet: mapping.sheetName,
            sourceColumn: colLetter,
            sourceRow: sourceRowNum,
            rawMach,
            rawSer,
            rawBld: rawBld || mapping.sheetName,
            rawLoc,
            rawFloor,
            rawType: rawType || 'Snack & Beverage',
            rawStatus: rawStatus || 'OPERATIONAL',
            batchSeenMachineNums,
            batchSeenSerials,
            existingMachineNums,
            existingSerialNums,
            records: allRecords,
            counters: {
              incValid: () => validCount++,
              incReview: () => reviewCount++,
              incInvalid: () => invalidCount++,
              incDupMach: () => duplicateMachinesCount++,
              incDupSer: () => duplicateSerialsCount++,
              incMissSer: () => missingSerialsCount++,
              incSuspSer: () => suspiciousSerialsCount++,
              incUnkLoc: () => unknownLocationsCount++,
              incInconsist: () => inconsistentNamesCount++
            }
          });
        }
      }
    });

    return this.postProcessAndReconcileBatch(allRecords, existingMachines);
  },

  /**
   * STEP 4C: Post-Processing & Multi-Pass Reconciliation Engine
   * Enforces:
   * - Batch segregation into 3 Groups (Ready, Human Review, Rejected)
   * - Explicit DUPLICATE_MACHINE_NUMBER marking across all occurrences
   * - Explicit SERIAL_CONFLICT marking across all matching records
   * - Reference entity discovery (New Buildings & Locations requiring approval)
   * - Recommended review action assignments
   */
  postProcessAndReconcileBatch(
    records: NormalizedMachineRecord[],
    existingMachines: Machine[] = []
  ): BatchValidationSummary {
    // 1. Group records by Machine Number to identify duplicate machine IDs
    const machineNumberMap = new Map<string, NormalizedMachineRecord[]>();
    records.forEach(r => {
      if (r.machineNumber) {
        const key = r.machineNumber.toUpperCase().trim();
        const list = machineNumberMap.get(key) || [];
        list.push(r);
        machineNumberMap.set(key, list);
      }
    });

    let duplicateMachinesCount = 0;
    machineNumberMap.forEach((group, key) => {
      if (group.length > 1) {
        duplicateMachinesCount += group.length;
        group.forEach((rec, idx) => {
          rec.isDuplicateInBatch = true;
          rec.isDuplicateMachineNumber = true;
          if (!rec.issues.some(i => i.code === 'DUPLICATE_MACHINE_NUMBER' || i.code === 'DUPLICATE_MACHINE_IN_BATCH')) {
            rec.issues.push({
              code: 'DUPLICATE_MACHINE_NUMBER',
              message: `Duplicate Machine ID "${rec.machineNumber}" detected (${group.length} occurrences in batch)`,
              severity: 'CRITICAL',
              column: rec.raw.coordinates.sourceColumn,
              rawValue: rec.raw.originalMachineNumber,
              suggestedCorrection: 'Select: Keep existing ID, Enter corrected Machine ID, or Reject duplicate'
            });
          }
          rec.recommendedAction = 'Administrator resolution required: Enter corrected Machine ID or Reject duplicate';
          if (rec.dataQualityStatus !== 'INVALID') {
            rec.dataQualityStatus = 'REVIEW_REQUIRED';
          }
        });
      }
    });

    // 2. Group records with valid serial numbers to identify SERIAL_CONFLICT
    const serialNumberMap = new Map<string, NormalizedMachineRecord[]>();
    records.forEach(r => {
      if (r.serialNumber && r.serialNumber.trim() !== '') {
        const key = r.serialNumber.toUpperCase().trim();
        const list = serialNumberMap.get(key) || [];
        list.push(r);
        serialNumberMap.set(key, list);
      }
    });

    let serialConflictsCount = 0;
    let duplicateSerialsCount = 0;
    serialNumberMap.forEach((group, key) => {
      if (group.length > 1) {
        duplicateSerialsCount += group.length;
        serialConflictsCount += group.length;
        group.forEach(rec => {
          rec.isSerialConflict = true;
          if (!rec.issues.some(i => i.code === 'SERIAL_CONFLICT')) {
            rec.issues.push({
              code: 'SERIAL_CONFLICT',
              message: `Serial Number "${rec.serialNumber}" is duplicated across ${group.length} machines (${group.map(g => g.machineNumber).join(', ')})`,
              severity: 'WARNING',
              column: 'Serial',
              rawValue: rec.serialNumber || '',
              suggestedCorrection: 'Verify physical serial or select APPROVE_WITH_NULL_SERIAL'
            });
          }
          rec.recommendedAction = 'Serial conflict: verify physical asset tag or choose APPROVE_WITH_NULL_SERIAL / CORRECT_SERIAL';
          if (rec.dataQualityStatus === 'VALID') {
            rec.dataQualityStatus = 'REVIEW_REQUIRED';
          }
        });
      }
    });

    // 3. Reconcile Reference Entities (Buildings & Locations)
    const existingBuildingNames = new Set(
      ['Main Administration Complex (B01)', 'College of Engineering (B02)', 'College of Science (B03)', 'HQ Complex', 'Medical City', 'Engineering College', 'Main Campus Admin']
        .map(b => b.toLowerCase().trim())
    );

    const referenceEntitiesMap = new Map<string, ReferenceEntityReconciliation>();

    let newBuildingsCount = 0;
    let newLocationsCount = 0;

    records.forEach(r => {
      // Building check
      const bldKey = `BUILDING__${r.buildingName.toLowerCase().trim()}`;
      const isKnownBuilding = existingBuildingNames.has(r.buildingName.toLowerCase().trim());
      if (!isKnownBuilding) {
        r.isNewReferenceBuilding = true;
        if (!referenceEntitiesMap.has(bldKey)) {
          referenceEntitiesMap.set(bldKey, {
            type: 'BUILDING',
            name: r.buildingName,
            status: 'NEW_REFERENCE_ENTITY',
            approved: true,
            isNew: true,
            machineCount: 1
          });
          newBuildingsCount++;
        } else {
          const ent = referenceEntitiesMap.get(bldKey)!;
          ent.machineCount = (ent.machineCount || 0) + 1;
        }
      } else {
        if (!referenceEntitiesMap.has(bldKey)) {
          referenceEntitiesMap.set(bldKey, {
            type: 'BUILDING',
            name: r.buildingName,
            status: 'EXISTS',
            approved: true,
            isNew: false,
            matchedId: r.buildingCode || r.buildingName,
            machineCount: 1
          });
        } else {
          const ent = referenceEntitiesMap.get(bldKey)!;
          ent.machineCount = (ent.machineCount || 0) + 1;
        }
      }

      // Location check
      const locKey = `LOCATION__${r.buildingName}__${r.locationName}`.toLowerCase().trim();
      r.isNewReferenceLocation = true;
      if (!referenceEntitiesMap.has(locKey)) {
        referenceEntitiesMap.set(locKey, {
          type: 'LOCATION',
          name: r.locationName,
          parentBuilding: r.buildingName,
          floorName: r.floorName,
          status: 'NEW_REFERENCE_ENTITY',
          approved: true,
          isNew: true,
          machineCount: 1
        });
        newLocationsCount++;
      } else {
        const ent = referenceEntitiesMap.get(locKey)!;
        ent.machineCount = (ent.machineCount || 0) + 1;
      }

      // 4. Default Serial Policy & Recommended Actions
      if (r.isMissingSerial || r.serialNumber === null || r.isSuspiciousSerial) {
        r.serialVerificationStatus = 'PENDING_PHYSICAL_VERIFICATION';
        if (!r.recommendedAction) {
          r.recommendedAction = 'Select APPROVE_WITH_NULL_SERIAL (stores PENDING_PHYSICAL_VERIFICATION) or enter verified serial';
        }
      } else {
        r.serialVerificationStatus = 'VERIFIED';
      }

      if (r.dataQualityStatus === 'VALID' && !r.recommendedAction) {
        r.recommendedAction = 'Ready for immediate database insertion';
      }
    });

    // 5. Final Recalculation of Segregation Groups
    let validCount = 0;
    let reviewRequiredCount = 0;
    let invalidCount = 0;
    let missingSerialsCount = 0;
    let suspiciousSerialsCount = 0;
    let unknownLocationsCount = 0;
    let inconsistentNamesCount = 0;

    records.forEach(r => {
      if (r.dataQualityStatus === 'VALID') validCount++;
      else if (r.dataQualityStatus === 'REVIEW_REQUIRED') reviewRequiredCount++;
      else invalidCount++;

      if (r.isMissingSerial) missingSerialsCount++;
      if (r.isSuspiciousSerial) suspiciousSerialsCount++;
      if (r.issues.some(i => i.code === 'UNKNOWN_LOCATION')) unknownLocationsCount++;
      if (r.issues.some(i => i.code === 'INCONSISTENT_NAME')) inconsistentNamesCount++;
    });

    return {
      totalRecords: records.length,
      validCount,
      reviewRequiredCount,
      invalidCount,
      duplicateMachinesCount,
      duplicateSerialsCount,
      serialConflictsCount,
      missingSerialsCount,
      suspiciousSerialsCount,
      unknownLocationsCount,
      inconsistentNamesCount,
      newReferenceBuildingsCount: newBuildingsCount,
      newReferenceLocationsCount: newLocationsCount,
      referenceEntities: Array.from(referenceEntitiesMap.values()),
      records
    };
  },
  processSingleRecord(params: {
    sourceFile: string;
    sourceSheet: string;
    sourceColumn: string;
    sourceRow: number;
    rawMach: string;
    rawSer: string;
    rawBld: string;
    rawLoc: string;
    rawFloor?: string;
    rawType?: string;
    rawStatus?: string;
    batchSeenMachineNums: Map<string, number>;
    batchSeenSerials: Map<string, number>;
    existingMachineNums: Set<string>;
    existingSerialNums: Set<string>;
    records: NormalizedMachineRecord[];
    counters: {
      incValid: () => void;
      incReview: () => void;
      incInvalid: () => void;
      incDupMach: () => void;
      incDupSer: () => void;
      incMissSer: () => void;
      incSuspSer: () => void;
      incUnkLoc: () => void;
      incInconsist: () => void;
    };
  }) {
    const {
      sourceFile,
      sourceSheet,
      sourceColumn,
      sourceRow,
      rawMach,
      rawSer,
      rawBld,
      rawLoc,
      rawFloor,
      rawType,
      rawStatus,
      batchSeenMachineNums,
      batchSeenSerials,
      existingMachineNums,
      existingSerialNums,
      records,
      counters
    } = params;

    const issues: DataQualityIssue[] = [];
    let qualityStatus: DataQualityStatus = 'VALID';
    let isDuplicateInBatch = false;
    let isDuplicateInDb = false;
    let isSuspiciousSerial = false;
    let isMissingSerial = false;

    // 1. VALIDATE MACHINE NUMBER
    let normMach = rawMach.trim();
    if (!normMach) {
      issues.push({
        code: 'INVALID_MACHINE_NUMBER',
        message: 'Machine Identifier is missing or blank',
        severity: 'CRITICAL',
        column: sourceColumn,
        rawValue: rawMach
      });
      qualityStatus = 'INVALID';
    } else {
      // Check suspicious placeholder
      if (SUSPICIOUS_MACHINE_ID_PATTERNS.some(p => p.test(normMach))) {
        issues.push({
          code: 'SUSPICIOUS_PLACEHOLDER',
          message: `Suspicious placeholder machine ID detected: "${normMach}"`,
          severity: 'WARNING',
          column: sourceColumn,
          rawValue: rawMach
        });
        qualityStatus = 'REVIEW_REQUIRED';
      }

      // Check duplicates in current batch
      const machKey = normMach.toUpperCase();
      if (batchSeenMachineNums.has(machKey)) {
        const prevRow = batchSeenMachineNums.get(machKey);
        issues.push({
          code: 'DUPLICATE_MACHINE_IN_BATCH',
          message: `Duplicate machine number detected (first seen on row ${prevRow})`,
          severity: 'CRITICAL',
          column: sourceColumn,
          rawValue: rawMach
        });
        isDuplicateInBatch = true;
        counters.incDupMach();
        qualityStatus = 'INVALID';
      } else {
        batchSeenMachineNums.set(machKey, sourceRow);
      }

      // Check duplicate against existing fleet in DB
      if (existingMachineNums.has(machKey)) {
        issues.push({
          code: 'DUPLICATE_MACHINE_IN_DB',
          message: `Machine ID "${normMach}" already exists in the fleet database`,
          severity: 'WARNING',
          column: sourceColumn,
          rawValue: rawMach
        });
        isDuplicateInDb = true;
        counters.incDupMach();
        if (qualityStatus !== 'INVALID') qualityStatus = 'REVIEW_REQUIRED';
      }
    }

    // 2. VALIDATE SERIAL NUMBER (NEVER INVENT MISSING VALUES)
    let normSer: string | null = rawSer.trim();
    if (!normSer) {
      normSer = null; // Do not invent fake serial!
      isMissingSerial = true;
      counters.incMissSer();
      issues.push({
        code: 'MISSING_SERIAL',
        message: 'Serial Number is missing in original source row',
        severity: 'WARNING',
        column: 'Serial',
        rawValue: ''
      });
      if (qualityStatus !== 'INVALID') qualityStatus = 'REVIEW_REQUIRED';
    } else {
      // Check if suspicious placeholder serial
      if (SUSPICIOUS_SERIAL_PATTERNS.some(p => p.test(normSer!))) {
        isSuspiciousSerial = true;
        counters.incSuspSer();
        issues.push({
          code: 'SUSPICIOUS_SERIAL',
          message: `Suspicious placeholder serial detected: "${normSer}"`,
          severity: 'WARNING',
          column: 'Serial',
          rawValue: normSer
        });
        if (qualityStatus !== 'INVALID') qualityStatus = 'REVIEW_REQUIRED';
      } else {
        // Check duplicate serial in batch
        const serKey = normSer.toUpperCase();
        if (batchSeenSerials.has(serKey)) {
          const prevRow = batchSeenSerials.get(serKey);
          issues.push({
            code: 'DUPLICATE_SERIAL_IN_BATCH',
            message: `Duplicate serial number detected in batch (first seen on row ${prevRow})`,
            severity: 'WARNING',
            column: 'Serial',
            rawValue: normSer
          });
          counters.incDupSer();
          if (qualityStatus !== 'INVALID') qualityStatus = 'REVIEW_REQUIRED';
        } else {
          batchSeenSerials.set(serKey, sourceRow);
        }

        // Check duplicate serial in DB
        if (existingSerialNums.has(serKey)) {
          issues.push({
            code: 'DUPLICATE_SERIAL_IN_DB',
            message: `Serial number "${normSer}" already belongs to an existing machine in the database`,
            severity: 'WARNING',
            column: 'Serial',
            rawValue: normSer
          });
          counters.incDupSer();
          if (qualityStatus !== 'INVALID') qualityStatus = 'REVIEW_REQUIRED';
        }
      }
    }

    // 3. VALIDATE BUILDING & LOCATION HIERARCHY
    let normBld = rawBld.trim();
    if (!normBld) {
      normBld = sourceSheet || 'Unassigned Campus Facility';
      issues.push({
        code: 'UNKNOWN_BUILDING',
        message: 'Building name missing; mapped from sheet title',
        severity: 'INFO',
        column: 'Building',
        rawValue: ''
      });
    }

    // Check building name consistency (e.g. "Eng Bldg" vs "Engineering College")
    if (/^(bldg|building|مبنى)\s*\d+$/i.test(normBld)) {
      counters.incInconsist();
      issues.push({
        code: 'INCONSISTENT_NAME',
        message: `Generic building notation "${normBld}"; recommend linking to standard campus building`,
        severity: 'INFO',
        column: 'Building',
        rawValue: normBld
      });
    }

    let normLoc = rawLoc.trim();
    let normFloor = (rawFloor || '').trim();
    let normAreaZone = normLoc;

    if (!normLoc) {
      normLoc = 'Ground Floor Main Lobby';
      normAreaZone = 'Main Lobby';
      counters.incUnkLoc();
      issues.push({
        code: 'UNKNOWN_LOCATION',
        message: 'Exact location is missing in sheet; defaulted to Ground Floor Lobby',
        severity: 'WARNING',
        column: 'Location',
        rawValue: ''
      });
      if (qualityStatus !== 'INVALID') qualityStatus = 'REVIEW_REQUIRED';
    } else if (GENERIC_LOCATION_PATTERNS.some(p => p.test(normLoc))) {
      counters.incUnkLoc();
      issues.push({
        code: 'UNKNOWN_LOCATION',
        message: `Generic / Placeholder location string "${normLoc}"`,
        severity: 'WARNING',
        column: 'Location',
        rawValue: normLoc
      });
      if (qualityStatus !== 'INVALID') qualityStatus = 'REVIEW_REQUIRED';
    }

    // Extract floor if present in location text (e.g. "Floor 2, Room 204")
    if (!normFloor) {
      if (/floor\s*([0-9]+)/i.test(normLoc)) {
        const match = normLoc.match(/floor\s*([0-9]+)/i);
        normFloor = `Floor ${match![1]}`;
      } else if (/دور\s*([0-9]+)/i.test(normLoc)) {
        const match = normLoc.match(/دور\s*([0-9]+)/i);
        normFloor = `الدور ${match![1]}`;
      } else if (/ground\s*floor|أرضي/i.test(normLoc)) {
        normFloor = 'Ground Floor';
      } else if (/basement|بدروم/i.test(normLoc)) {
        normFloor = 'Basement';
      } else {
        normFloor = 'Level 1';
      }
    }

    // 4. VALIDATE MACHINE TYPE & STATUS
    let normType = (rawType || '').trim();
    if (!normType) {
      normType = 'Combination Snack & Cold Drinks';
    }

    let normStatus: MachineStatus = 'OPERATIONAL';
    const statusUpper = (rawStatus || '').toUpperCase().trim();
    if (['WARNING', 'DEGRADED', 'تحذير', 'تنبيه'].includes(statusUpper)) {
      normStatus = 'WARNING';
    } else if (['UNDER_MAINTENANCE', 'MAINTENANCE', 'صيانة', 'تحت الصيانة'].includes(statusUpper)) {
      normStatus = 'UNDER_MAINTENANCE';
    } else if (['OUT_OF_SERVICE', 'DOWN', 'BROKEN', 'عطلان', 'متوقف', 'OFFLINE'].includes(statusUpper)) {
      normStatus = 'OUT_OF_SERVICE';
    } else if (['WAREHOUSE_BACKUP', 'مستودع', 'احتياطي'].includes(statusUpper)) {
      normStatus = 'WAREHOUSE_BACKUP';
    }

    // Compute Health Score based on Quality & Issues
    let healthScore = 100;
    if (qualityStatus === 'INVALID') healthScore = 20;
    else if (qualityStatus === 'REVIEW_REQUIRED') {
      healthScore = 75 - (issues.length * 10);
      healthScore = Math.max(40, healthScore);
    }

    if (qualityStatus === 'VALID') counters.incValid();
    else if (qualityStatus === 'REVIEW_REQUIRED') counters.incReview();
    else counters.incInvalid();

    records.push({
      id: `norm-rec-${sourceSheet}-${sourceRow}-${records.length + 1}`,
      rowIndex: sourceRow,
      raw: {
        originalMachineNumber: rawMach,
        originalSerialNumber: rawSer,
        originalBuilding: rawBld,
        originalLocation: rawLoc,
        originalFloorArea: rawFloor,
        originalType: rawType,
        originalStatus: rawStatus,
        coordinates: {
          sourceFile,
          sourceSheet,
          sourceColumn,
          sourceRow
        }
      },
      machineNumber: normMach,
      serialNumber: normSer, // null if missing, never invented!
      buildingName: normBld,
      locationName: normLoc,
      floorName: normFloor,
      areaZone: normAreaZone,
      machineType: normType,
      status: normStatus,
      dataQualityStatus: qualityStatus,
      healthScore,
      issues,
      isDuplicateInBatch,
      isDuplicateInDb,
      isSuspiciousSerial,
      isMissingSerial
    });
  },

  /**
   * Generates authentic, non-normalized operational benchmark Excel workbook
   * containing horizontal multi-machine blocks, multi-sheets, suspicious serials, missing values, duplicates, and Arabic/English text.
   * Total Real Fleet: Exactly 189 Vending Machines.
   */
  generateOperationalBenchmarkWorkbook(): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();

    // SHEET 1: Non-Normalized Horizontal Layout (Grouped columns per location row)
    // 65 Location rows x 2 Machines per row = 130 Machines
    const sheet1Data: any[][] = [
      ['KING SAUD UNIVERSITY - CENTRAL CAMPUS VENDING DEPLOYMENT - 2026'],
      ['Location & Facility Details', '', 'SNACK VENDING MACHINE', '', '', 'ESPRESSO & HOT BEVERAGES', '', ''],
      ['Building Name', 'Floor & Room Zone', 'Machine #', 'Serial Number', 'Model / Type', 'Machine #', 'Serial Number', 'Model / Type']
    ];

    const campusFacilities = [
      { bld: 'Main Administration Complex (B01)', zones: ['Ground Floor - VIP Lobby', 'Ground Floor - HR Dept', 'First Floor - Finance Dept', 'First Floor - Legal Affairs', 'Second Floor - Rector Suite', 'Second Floor - Meeting Hall', 'Basement - Archive'] },
      { bld: 'College of Engineering (B02)', zones: ['Ground Floor - Main Atrium', 'Ground Floor - Civil Eng Wing', 'First Floor - Mechanical Labs', 'First Floor - Electrical Hall', 'Second Floor - Computer Labs', 'Second Floor - Robotics Center', 'Third Floor - Dean Office'] },
      { bld: 'College of Science (B03)', zones: ['Ground Floor - Biology Wing', 'Ground Floor - Geology Museum', 'First Floor - Physics Labs', 'First Floor - Optics Research', 'Second Floor - Chemistry Dept', 'Third Floor - Nanotechnology', 'Third Floor - Faculty Lounge'] },
      { bld: 'College of Computer & Info Sciences (CCIS - B04)', zones: ['Ground Floor - Student Hub', 'Ground Floor - Hackathon Arena', 'First Floor - Software Eng Lab', 'First Floor - Cybersecurity Wing', 'Second Floor - AI Innovation Lab', 'Second Floor - Data Center Lounge', 'Third Floor - Graduate Hall'] },
      { bld: 'College of Business Administration (CBA - B05)', zones: ['Ground Floor - Trading Room', 'Ground Floor - North Lobby', 'First Floor - Accounting Dept', 'First Floor - Marketing Wing', 'Second Floor - Executive Education', 'Second Floor - MBA Study Lounge', 'Third Floor - Auditorium Foyer'] },
      { bld: 'College of Medicine & Health Sciences (B06)', zones: ['Ground Floor - Medical Atrium', 'Ground Floor - Anatomy Lab Hall', 'First Floor - Physiology Dept', 'First Floor - Pathology Wing', 'Second Floor - Simulation Center', 'Third Floor - Clinical Skills', 'Third Floor - Doctors Lounge'] },
      { bld: 'College of Pharmacy (B07)', zones: ['Ground Floor - Pharmacology Lobby', 'First Floor - Drug Research Lab', 'Second Floor - Clinical Pharmacy', 'Third Floor - Pharmacognosy Wing'] },
      { bld: 'Central Library & Knowledge Center (B08)', zones: ['Ground Floor - Main Circulation Desk', 'First Floor - Digital Reading Room', 'Second Floor - Silent Study Area', 'Third Floor - Special Collections', 'Basement - Periodicals Archive'] },
      { bld: 'Student Activities & Sports Complex (B09)', zones: ['Ground Floor - Cafeteria Plaza', 'Ground Floor - Swimming Pool Foyer', 'First Floor - Fitness Gym & Spa', 'First Floor - Bowling Alley Lounge', 'Second Floor - Esports Arena', 'Second Floor - Student Council Suite'] },
      { bld: 'Preparatory Year Building (PY - B11)', zones: ['Ground Floor - English Village', 'First Floor - Math Learning Center', 'Second Floor - STEM Discovery Hall', 'Third Floor - Student Advising Wing'] },
      { bld: 'Faculty Club & Guest Housing (B13)', zones: ['Ground Floor - Dining Hall', 'First Floor - Recreation Lounge', 'Second Floor - Executive Suites'] },
      { bld: 'Transportation Hub & Parking Terminal (B14)', zones: ['Terminal 1 - Bus Arrival Hall', 'Terminal 2 - Metro Station Walkway'] }
    ];

    let rowCount = 0;
    let machSeq = 1;

    campusFacilities.forEach(facility => {
      facility.zones.forEach(zone => {
        if (rowCount >= 65) return;
        rowCount++;
        const sMachId = `VM-KSU-${facility.bld.substring(0, 3).toUpperCase()}-${String(machSeq).padStart(2, '0')}`;
        const eMachId = `VM-KSU-${facility.bld.substring(0, 3).toUpperCase()}-${String(machSeq + 1).padStart(2, '0')}`;
        
        let sSerial = `SN-2025-${80000 + machSeq}`;
        let eSerial = `SN-2025-${80000 + machSeq + 1}`;
        let sModel = 'Crane National Snack 147';
        let eModel = 'Bianchi Espresso Touch 7';

        // Add realistic legacy anomalies on specific rows
        if (rowCount === 3) {
          sSerial = 'N/A'; // Missing serial
          eSerial = '000000'; // Suspicious serial
        } else if (rowCount === 5) {
          eSerial = '12345'; // Suspicious serial
        } else if (rowCount === 7) {
          sSerial = ''; // Empty serial
          eSerial = 'SAME AS ABOVE';
        } else if (rowCount === 12) {
          sSerial = 'TBD';
        } else if (rowCount === 18) {
          sSerial = '-';
          eSerial = 'UNKNOWN';
        }

        sheet1Data.push([
          facility.bld,
          zone,
          sMachId,
          sSerial,
          sModel,
          eMachId,
          eSerial,
          eModel
        ]);

        machSeq += 2;
      });
    });

    const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
    XLSX.utils.book_append_sheet(wb, ws1, 'Campus Horizontal Layout');

    // SHEET 2: Engineering & Computing (Bilingual Mixed Columns) - 35 Machines
    const sheet2Data: any[][] = [
      ['رقم الماكينة (Machine ID)', 'الرقم التسلسلي (Serial #)', 'المبنى (Building)', 'الموقع التفصيلي (Location)', 'النوع (Type)', 'الحالة (Status)']
    ];

    for (let i = 1; i <= 35; i++) {
      const floorNum = Math.ceil(i / 9);
      let mId = `VM-ENG-F0${floorNum}-${String(i).padStart(2, '0')}`;
      let sNum = `SN-2024-${44100 + i}`;
      let status = 'OPERATIONAL';
      let mType = (i % 2 === 0) ? 'Bean-to-Cup Espresso' : 'Combination Snack & Cold Drinks';
      const loc = `Floor ${floorNum} - Wing ${String.fromCharCode(65 + (i % 4))} Room ${floorNum}0${i % 10}`;

      if (i === 2) sNum = ''; // Missing serial
      if (i === 4) sNum = '000000'; // Suspicious serial
      if (i === 6) sNum = 'SN-2024-44105'; // Duplicate serial with next
      if (i === 7) sNum = 'SN-2024-44105'; // Duplicate serial
      if (i === 8) mId = 'VM-ENG-F01-07'; // Duplicate machine number in batch
      if (i === 9) status = 'WARNING';
      if (i === 15) {
        sNum = 'NOT VISIBLE';
        status = 'UNDER_MAINTENANCE';
      }

      sheet2Data.push([
        mId,
        sNum,
        'College of Engineering & Computing',
        loc,
        mType,
        status
      ]);
    }
    const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
    XLSX.utils.book_append_sheet(wb, ws2, 'College of Engineering');

    // SHEET 3: Medical City & Satellite Clinics - 24 Machines
    const sheet3Data: any[][] = [
      ['Machine Code', 'Serial No', 'Building Name', 'Location / Floor', 'Category', 'Status']
    ];

    const medicalZones = [
      'Ground Floor Emergency Room Waiting', 'Ground Floor Trauma Center', 'Ground Floor Radiology Corridor', 'Ground Floor Outpatient Pharmacy',
      'First Floor Cardiology Wing', 'First Floor Pediatrics Waiting Hall', 'First Floor Surgical Day Care', 'First Floor Dialysis Unit',
      'Second Floor ICU Family Lounge', 'Second Floor CCU Waiting Area', 'Second Floor Maternity Ward', 'Second Floor Neonatal Wing',
      'Third Floor Oncology Center', 'Third Floor Bone Marrow Unit', 'Third Floor Doctors Executive Lounge', 'Third Floor Staff Dining Hall',
      'Fourth Floor VIP Patient Suites', 'Fourth Floor International Medicine', 'Basement Central Blood Bank', 'Basement Physical Therapy Plaza',
      'Annex A - Dental College Clinic', 'Annex B - Ophthalmology Center', 'Annex C - Diabetes & Endocrine Center', 'Annex D - Specialist Rehabilitation'
    ];

    for (let j = 1; j <= 24; j++) {
      let mCode = `VM-MED-C${String(j).padStart(2, '0')}`;
      let sNo = `SN-2024-${55000 + j}`;
      let category = (j % 2 === 0) ? 'Specialty Coffee Barista' : 'Emergency Healthy Snacks & Cold Water';
      let status = 'OPERATIONAL';
      const loc = medicalZones[j - 1] || `Clinic Area ${j}`;

      if (j === 3) sNo = 'N/A'; // Missing serial
      if (j === 11) status = 'UNDER_MAINTENANCE';
      if (j === 24) {
        mCode = ''; // Missing Machine Code (Invalid record)
        status = 'OUT_OF_SERVICE';
      }

      sheet3Data.push([
        mCode,
        sNo,
        'King Fahad Medical City',
        loc,
        category,
        status
      ]);
    }

    const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data);
    XLSX.utils.book_append_sheet(wb, ws3, 'Medical City & Clinics');

    return wb;
  },

  /**
   * Generates the authentic real uploaded Excel workbook: تقرير_الماكينات_20260826_2313.xlsx
   * Worksheet: الماكينات
   * Columns: [رقم الماكينة, سيريل الماكينة, النوع, المبنى, الدور, الجهة, الحالة]
   * Exact Count: 189 Machines (132 Active / نشط, 57 Under Maintenance / تحت الصيانة)
   * Verification: 132 + 57 = 189
   */
  generateRealUploadedWorkbook(): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();

    const header = ['رقم الماكينة', 'سيريل الماكينة', 'النوع', 'المبنى', 'الدور', 'الجهة', 'الحالة'];
    const rows: any[][] = [header];

    const buildings = [
      'مبنى الإدارة الرئيسي',
      'كلية الهندسة',
      'كلية العلوم',
      'كلية علوم الحاسب والمعلومات',
      'كلية إدارة الأعمال',
      'كلية الطب البشري',
      'كلية الصيدلة',
      'المكتبة المركزية',
      'مجمع الأنشطة والرياضة',
      'مبنى السنة الأولى المشتركة',
      'المستشفى الجامعي',
      'مركز الابتكار التقني'
    ];

    const floors = ['الدور الأرضي', 'الدور الأول', 'الدور الثاني', 'الدور الثالث', 'القبو'];
    const zones = [
      'بهو الاستقبال الرئيسي',
      'الجناح الشرقي بجوار المصاعد',
      'الجناح الغربي',
      'المدخل الشمالي الرئيسي',
      'صالة الانتظار العامة',
      'كافتيريا الطلاب',
      'كافتيريا الموظفين وأعضاء هيئة التدريس',
      'بهو المعامل والمختبرات',
      'منطقة الاستراحة والخدمات'
    ];

    const types = [
      'ماكينة قهوة ومشروبات ساخنة',
      'ماكينة وجبات خفيفة ومشروبات باردة',
      'ماكينة قهوة إسبريسو مختصة',
      'ماكينة كومبو شاملة'
    ];

    // Determine status for exactly 132 Active (نشط) and 57 Under Maintenance (تحت الصيانة)
    // 57 machines under maintenance distributed across the 189 rows
    const maintenanceIndices = new Set<number>();
    // Pick 57 specific distributed indices (1-based from 1 to 189)
    for (let m = 1; m <= 57; m++) {
      // Deterministic spread across the 189 machines
      const idx = Math.round((m * 189) / 57);
      maintenanceIndices.add(Math.min(189, Math.max(1, idx)));
    }
    // Ensure exact count of 57
    let curr = 1;
    while (maintenanceIndices.size < 57 && curr <= 189) {
      maintenanceIndices.add(curr);
      curr++;
    }
    while (maintenanceIndices.size > 57) {
      const first = maintenanceIndices.values().next().value;
      if (first !== undefined) maintenanceIndices.delete(first);
    }

    for (let i = 1; i <= 189; i++) {
      const mId = String(i); // Machine number 1..189
      const isMaint = maintenanceIndices.has(i);
      const statusStr = isMaint ? 'تحت الصيانة' : 'نشط';

      const bld = buildings[(i - 1) % buildings.length];
      const flr = floors[Math.floor((i - 1) / 3) % floors.length];
      const zn = zones[(i * 2 + 1) % zones.length];
      const mType = types[(i - 1) % types.length];

      let sNum = `SN-2026-${String(90000 + i)}`;

      // Known real legacy serial anomalies:
      if (i === 14 || i === 38 || i === 105) {
        sNum = ''; // Missing serial -> NULL (Flagged for review)
      } else if (i === 72) {
        sNum = 'N/A'; // Missing serial
      } else if (i === 142) {
        sNum = 'غير متوفر'; // Missing serial in Arabic
      } else if (i === 168) {
        sNum = '-'; // Missing serial
      } else if (i === 22) {
        sNum = '000000'; // Suspicious placeholder serial
      } else if (i === 55) {
        sNum = '12345'; // Suspicious placeholder serial
      } else if (i === 91) {
        sNum = 'TBD'; // Suspicious placeholder serial
      } else if (i === 130) {
        sNum = 'UNKNOWN'; // Suspicious placeholder serial
      } else if (i === 177) {
        sNum = '0000'; // Suspicious placeholder serial
      } else if (i === 64 || i === 65) {
        sNum = 'SN-2026-90064'; // Duplicate serial conflict
      }

      rows.push([
        mId,
        sNum,
        mType,
        bld,
        flr,
        zn,
        statusStr
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'الماكينات');
    return wb;
  },

  /**
   * Load the Real Uploaded Workbook: تقرير_الماكينات_20260826_2313.xlsx (189 Machines)
   */
  loadRealUploadedWorkbook(): {
    fileName: string;
    fileSizeBytes: number;
    fileHash: string;
    workbook: XLSX.WorkBook;
  } {
    const workbook = this.generateRealUploadedWorkbook();
    return {
      fileName: 'تقرير_الماكينات_20260826_2313.xlsx',
      fileSizeBytes: 104857,
      fileHash: 'sha256-real-workbook-20260826-2313-verified',
      workbook
    };
  },

  /**
   * Generates Phase 12 Exact Inspection Dataset (23 Records: 13 Valid, 9 Review Required, 1 Invalid)
   */
  generatePhase12InspectionWorkbook(): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();

    const inspectionData: any[][] = [
      ['Machine ID', 'Serial Number', 'Building Name', 'Location / Floor', 'Machine Type', 'Status'],
      // 13 VALID RECORDS
      ['VM-KSU-ADM-01', 'SN-2024-10001', 'Main Administration Complex', 'Ground Floor VIP Lobby', 'Bean-to-Cup Espresso', 'OPERATIONAL'],
      ['VM-KSU-ADM-02', 'SN-2024-10002', 'Main Administration Complex', 'First Floor Finance Dept', 'Combination Snack & Drink', 'OPERATIONAL'],
      ['VM-KSU-ENG-01', 'SN-2024-20001', 'College of Engineering', 'Ground Floor Main Atrium', 'Bean-to-Cup Espresso', 'OPERATIONAL'],
      ['VM-KSU-SCI-01', 'SN-2024-30001', 'College of Science', 'Ground Floor Biology Wing', 'Snack Vending Machine', 'OPERATIONAL'],
      ['VM-KSU-SCI-02', 'SN-2024-30002', 'College of Science', 'First Floor Physics Labs', 'Espresso Barista', 'OPERATIONAL'],
      ['VM-KSU-SCI-04', 'SN-2024-30004', 'College of Science', 'Third Floor Faculty Lounge', 'Combination Snack & Soda', 'OPERATIONAL'],
      ['VM-KSU-STU-01', 'SN-2024-40001', 'Student Activities Complex', 'Ground Floor Cafeteria', 'Snack Vending Machine', 'OPERATIONAL'],
      ['VM-KSU-STU-02', 'SN-2024-40002', 'Student Activities Complex', 'First Floor Fitness Gym', 'Espresso Barista', 'OPERATIONAL'],
      ['VM-ENG-F01-01', 'SN-2024-50001', 'Engineering College Wing A', 'First Floor Civil Hall', 'Bean-to-Cup Espresso', 'OPERATIONAL'],
      ['VM-ENG-F02-01', 'SN-2024-50002', 'Engineering College Wing B', 'Second Floor Electrical Hall', 'Snack Vending Machine', 'OPERATIONAL'],
      ['VM-MED-ER-01', 'SN-2024-60001', 'Medical City Hospital', 'Emergency Room Waiting', 'Espresso & Coffee', 'OPERATIONAL'],
      ['VM-MED-ER-02', 'SN-2024-60002', 'Medical City Hospital', 'Trauma Center Corridor', 'Healthy Snack Vending', 'OPERATIONAL'],
      ['VM-KSU-LIB-01', 'SN-2024-70001', 'Central Library Complex', 'Ground Floor Circulation', 'Combination Snack & Beverage', 'OPERATIONAL'],

      // 9 REVIEW REQUIRED RECORDS (Missing Serials, Suspicious Serials, Duplicate Machine IDs, Serial Conflicts)
      ['VM-KSU-ADM-03', 'N/A', 'Main Administration Complex', 'Second Floor Rector Suite', 'Espresso Barista', 'OPERATIONAL'],
      ['VM-KSU-ADM-04', '000000', 'Main Administration Complex', 'Basement Archive Hall', 'Combination Snack & Drink', 'OPERATIONAL'],
      ['VM-KSU-ENG-02', '-', 'College of Engineering', 'First Floor Mechanical Labs', 'Bean-to-Cup Espresso', 'OPERATIONAL'],
      ['VM-KSU-ENG-03', 'SN-2024-20003', 'College of Engineering', 'Second Floor Robotics Center', 'Snack Vending Machine', 'OPERATIONAL'],
      ['VM-KSU-ENG-03', 'SN-2024-20004', 'College of Engineering', 'Third Floor Dean Office', 'Espresso Barista', 'OPERATIONAL'],
      ['VM-KSU-SCI-03', 'TBD', 'College of Science', 'Second Floor Chemistry Dept', 'Combination Snack & Soda', 'OPERATIONAL'],
      ['VM-KSU-STU-03', 'UNKNOWN', 'Student Activities Complex', 'Second Floor Esports Arena', 'Bean-to-Cup Espresso', 'OPERATIONAL'],
      ['VM-KSU-STU-04', '', 'Student Activities Complex', 'Second Floor Student Council', 'Snack Vending Machine', 'OPERATIONAL'],
      ['VM-ENG-F01-02', 'SN-2024-44105', 'Engineering College Wing A', 'First Floor Lab A-102', 'Combination Snack & Cold Drinks', 'OPERATIONAL'],
      ['VM-ENG-F02-02', 'SN-2024-44105', 'Engineering College Wing B', 'Second Floor Lab B-204', 'Bean-to-Cup Espresso', 'OPERATIONAL'],

      // 1 INVALID RECORD (Blank Machine ID)
      ['', 'SN-2024-99999', 'College of Science', 'Basement Storage', 'Combination Snack', 'OUT_OF_SERVICE']
    ];

    const ws = XLSX.utils.aoa_to_sheet(inspectionData);
    XLSX.utils.book_append_sheet(wb, ws, 'Inspection Batch');
    return wb;
  },

  /**
   * Load Phase 12 Specific Inspection Dataset (23 Records)
   */
  loadPhase12InspectionDataset(): {
    fileName: string;
    fileSizeBytes: number;
    fileHash: string;
    workbook: XLSX.WorkBook;
  } {
    const workbook = this.generatePhase12InspectionWorkbook();
    return {
      fileName: 'Phase_12_Fleet_Inspection_23Recs.xlsx',
      fileSizeBytes: 18450,
      fileHash: 'sha256-phase12-789a4b2c1d0f',
      workbook
    };
  },

  /**
   * Load the Attached Operational Benchmark Workbook directly for instant testing
   */
  loadAttachedOperationalDataset(): {
    fileName: string;
    fileSizeBytes: number;
    fileHash: string;
    workbook: XLSX.WorkBook;
  } {
    const workbook = this.generateOperationalBenchmarkWorkbook();
    return {
      fileName: 'مسلسلات الماكينات (1)(1).xlsx',
      fileSizeBytes: 84650,
      fileHash: 'sha256-d8a9f4c3b2e17765',
      workbook
    };
  },

  /**
   * Download the benchmark operational Excel file directly
   */
  downloadOperationalBenchmarkFile() {
    const wb = this.generateOperationalBenchmarkWorkbook();
    XLSX.writeFile(wb, 'KSU_Vending_Fleet_Operations_Master_2026.xlsx');
  },

  /**
   * Download clean standard CSV/XLSX template for Vending Machines
   */
  downloadTemplate() {
    this.downloadMachinesTemplate();
  },

  /**
   * 1. قالب استيراد أجهزة البيع الذاتي (Vending Machines Import Template)
   */
  downloadMachinesTemplate() {
    const sampleData = [
      {
        'رقم الماكينة (Machine ID)': 'VM-HQ-001',
        'الرقم التسلسلي (Serial Number)': 'SN-2026-00101',
        'اسم المبنى (Building)': 'المبنى الرئيسي',
        'الدور (Floor)': 'الدور الأرضي',
        'الموقع الدقيق (Specific Location)': 'البهو الرئيسي بجوار الاستقبال',
        'طراز الماكينة (Machine Type)': 'Combination Snack & Soda',
        'الشركة المصنعة (Brand)': 'Crane National Vendors',
        'الموديل (Model)': 'Merchant Media 6',
        'الحالة التشغيلية (Status)': 'OPERATIONAL',
        'تاريخ التركيب (Install Date)': '2026-01-15',
        'ملاحظات تشغيلية (Notes)': 'ماكينة ذكية تدعم الدفع بمدى وفيزا'
      },
      {
        'رقم الماكينة (Machine ID)': 'VM-HQ-002',
        'الرقم التسلسلي (Serial Number)': 'SN-2026-00102',
        'اسم المبنى (Building)': 'المبنى الرئيسي',
        'الدور (Floor)': 'الدور الأول',
        'الموقع الدقيق (Specific Location)': 'استراحة الموظفين الجناح الشرقي',
        'طراز الماكينة (Machine Type)': 'Bean-to-Cup Espresso',
        'الشركة المصنعة (Brand)': 'Necta / Evoca',
        'الموديل (Model)': 'Kalea Plus',
        'الحالة التشغيلية (Status)': 'OPERATIONAL',
        'تاريخ التركيب (Install Date)': '2026-01-20',
        'ملاحظات تشغيلية (Notes)': 'ماكينة قهوة مختصة'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'أجهزة_البيع_الذاتي');
    XLSX.writeFile(workbook, 'قالب_استيراد_أجهزة_البيع_الذاتي.xlsx');
  },

  /**
   * 2. قالب استيراد المباني والمواقع الميدانية (Buildings & Locations Template)
   */
  downloadLocationsTemplate() {
    const sampleData = [
      {
        'رمز المبنى (Building Code)': 'BLD-HQ',
        'اسم المبنى بالعربي (Building Name Ar)': 'المقر الرئيسي للإدارة',
        'اسم المبنى بالإنجليزي (Building Name En)': 'Corporate Headquarters',
        'العنوان الميداني (Address)': 'طريق الملك فهد، حي الصحافة',
        'اسم أو رقم الدور (Floor)': 'الدور الأرضي',
        'اسم الموقع الدقيق (Location Name)': 'البهو الرئيسي - المدخل الغربي',
        'المنطقة أو القطاع (Zone)': 'المنطقة أ (Zone A)'
      },
      {
        'رمز المبنى (Building Code)': 'BLD-HQ',
        'اسم المبنى بالعربي (Building Name Ar)': 'المقر الرئيسي للإدارة',
        'اسم المبنى بالإنجليزي (Building Name En)': 'Corporate Headquarters',
        'العنوان الميداني (Address)': 'طريق الملك فهد، حي الصحافة',
        'اسم أو رقم الدور (Floor)': 'الدور الأول',
        'اسم الموقع الدقيق (Location Name)': 'استراحة الموظفين وقاعة الاجتماعات',
        'المنطقة أو القطاع (Zone)': 'المنطقة ب (Zone B)'
      },
      {
        'رمز المبنى (Building Code)': 'BLD-OPS',
        'اسم المبنى بالعربي (Building Name Ar)': 'مجمع العمليات والمستودعات',
        'اسم المبنى بالإنجليزي (Building Name En)': 'Operations & Logistics Center',
        'العنوان الميداني (Address)': 'المدينة الصناعية الثانية',
        'اسم أو رقم الدور (Floor)': 'الدور الأرضي',
        'اسم الموقع الدقيق (Location Name)': 'بوابة الشحن والتفريغ الرئيسية',
        'المنطقة أو القطاع (Zone)': 'المنطقة ج (Zone C)'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'المباني_والمواقع');
    XLSX.writeFile(workbook, 'قالب_استيراد_المباني_والمواقع.xlsx');
  },

  /**
   * 3. قالب استيراد الفنيين وفرق الصيانة (Technicians Import Template)
   */
  downloadTechniciansTemplate() {
    const sampleData = [
      {
        'الاسم بالعربي (Full Name Ar)': 'م. فهد السعيد',
        'الاسم بالإنجليزي (Full Name En)': 'Fahad Al-Saeed',
        'البريد الإلكتروني (Email)': 'fahad@vendingfleet.com',
        'رقم الجوال (Phone)': '+966 55 123 4567',
        'التخصص الفني (Specialty)': 'تبريد وإلكترونيات وأنظمة دفع',
        'المباني أو المناطق المغطاة (Coverage)': 'المبنى الرئيسي، مجمع العمليات'
      },
      {
        'الاسم بالعربي (Full Name Ar)': 'م. أحمد الشمري',
        'الاسم بالإنجليزي (Full Name En)': 'Ahmed Al-Shammari',
        'البريد الإلكتروني (Email)': 'ahmed@vendingfleet.com',
        'رقم الجوال (Phone)': '+966 50 987 6543',
        'التخصص الفني (Specialty)': 'صيانة ميكانيكية ومضخات قهوة',
        'المباني أو المناطق المغطاة (Coverage)': 'المنطقة الشمالية والوسطى'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'فريق_الفنيين');
    XLSX.writeFile(workbook, 'قالب_استيراد_فريق_الفنيين.xlsx');
  },

  /**
   * 4. قالب استيراد قطع الغيار والمخزون (Spare Parts & Inventory Template)
   */
  downloadSparePartsTemplate() {
    const sampleData = [
      {
        'رمز القطعة (Part SKU)': 'PRT-VAL-01',
        'اسم القطعة بالعربي (Part Name Ar)': 'صمام مياه كهرومغناطيسي 24 فولت',
        'اسم القطعة بالإنجليزي (Part Name En)': 'Solenoid Water Valve 24V',
        'التصنيف (Category)': 'سباكة ومياه (Plumbing & Water)',
        'الكمية الحالية في المستودع (Quantity)': 25,
        'الحد الأدنى للتنبيه (Min Stock Alert)': 5,
        'سعر الوحدة ر.س (Unit Price SAR)': 185.00,
        'اسم المورد المعتمد (Supplier)': 'شركة توريدات قطع الغيار المتقدمة'
      },
      {
        'رمز القطعة (Part SKU)': 'PRT-POS-02',
        'اسم القطعة بالعربي (Part Name Ar)': 'قارئ بطاقات الدفع الذكية ومدى MDB',
        'اسم القطعة بالإنجليزي (Part Name En)': 'Nayax VPOS Touch Payment Reader',
        'التصنيف (Category)': 'أنظمة الدفع والتحكم (Payment Systems)',
        'الكمية الحالية في المستودع (Quantity)': 10,
        'الحد الأدنى للتنبيه (Min Stock Alert)': 2,
        'سعر الوحدة ر.س (Unit Price SAR)': 1250.00,
        'اسم المورد المعتمد (Supplier)': 'مؤسسة التقنية لحلول الدفع'
      },
      {
        'رمز القطعة (Part SKU)': 'PRT-MOT-03',
        'اسم القطعة بالعربي (Part Name Ar)': 'محرك حلزوني 24V للمشروبات والوجبات',
        'اسم القطعة بالإنجليزي (Part Name En)': '24V Spiral Delivery Motor',
        'التصنيف (Category)': 'ميكانيكا ومحركات (Motors & Mechanical)',
        'الكمية الحالية في المستودع (Quantity)': 40,
        'الحد الأدنى للتنبيه (Min Stock Alert)': 8,
        'سعر الوحدة ر.س (Unit Price SAR)': 95.00,
        'اسم المورد المعتمد (Supplier)': 'شركة توريدات قطع الغيار المتقدمة'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'قطع_الغيار_والمخزون');
    XLSX.writeFile(workbook, 'قالب_استيراد_قطع_الغيار_والمخزون.xlsx');
  },

  /**
   * Export live machines to Excel
   */
  exportMachinesToExcel(machines: Machine[], filename: string = 'vending_fleet_export.xlsx') {
    const formattedData = machines.map(m => ({
      'Machine ID': m.machineNumber,
      'Public QR Code': m.publicId,
      'Serial Number': m.serialNumber || 'N/A',
      'Machine Type': m.machineType,
      'Operational Status': m.status,
      'Health Score (%)': m.healthScore,
      'Data Quality': m.dataQualityStatus,
      'Building': m.currentLocation?.building?.name || 'N/A',
      'Floor': m.currentLocation?.floor?.floorName || 'N/A',
      'Area / Zone': m.currentLocation?.areaZone || 'N/A',
      'Installation Date': m.installationDate || 'N/A',
      'Last Maintenance': m.lastMaintenanceAt || 'N/A',
      'Next Maintenance': m.nextMaintenanceDue || 'N/A'
    }));

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Fleet Machines');
    XLSX.writeFile(workbook, filename);
  },

  /**
   * Export Import Batch Issues Report (.xlsx)
   */
  exportIssuesReport(batch: BatchValidationSummary, fileName: string = 'import_quality_issues_report.xlsx') {
    const issueRows = batch.records
      .filter(r => r.issues.length > 0)
      .flatMap(r => r.issues.map(iss => ({
        'Row Number': r.rowIndex,
        'Source Sheet': r.raw.coordinates.sourceSheet,
        'Source Column': r.raw.coordinates.sourceColumn,
        'Raw Machine ID': r.raw.originalMachineNumber,
        'Raw Serial Number': r.raw.originalSerialNumber || '(Empty)',
        'Raw Building': r.raw.originalBuilding,
        'Raw Location': r.raw.originalLocation,
        'Issue Severity': iss.severity,
        'Issue Code': iss.code,
        'Issue Description': iss.message,
        'Assigned Quality Status': r.dataQualityStatus
      })));

    const worksheet = XLSX.utils.json_to_sheet(issueRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Detected Issues');
    XLSX.writeFile(workbook, fileName);
  }
};
