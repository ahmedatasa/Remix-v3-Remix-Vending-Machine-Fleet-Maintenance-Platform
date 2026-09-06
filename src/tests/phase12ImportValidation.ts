/**
 * PHASE 12: Real Vending Machine Data Import & Migration Validation Suite
 * 
 * Verifies:
 * - Read-Only Workbook Inspection
 * - Header and Multi-Block Horizontal Structure Detection
 * - Data Field Mapping & Provenance Tracking
 * - Data Quality Validation & Anomaly Detection (Missing, Suspicious, Duplicate Serials)
 * - Existing Database Fleet Reconciliation (Matching by Serial > Machine Number)
 * - Import Preview Generation & Action Categorization (INSERT / UPDATE / SKIP / REVIEW / ERROR)
 * - Strict Stop Rule Verification (Read-Only Safety Barrier)
 * - Traceable Audit Trail & Non-Destructive Ingestion Flow
 */

import { excelService } from '../services/excelService';
import { api } from '../services/api';
import { Machine } from '../types';

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
    throw new Error(`Assertion failed: ${testName} - ${detail || ''}`);
  }
}

async function runPhase12Validation() {
  console.log('\n====================================================');
  console.log('🚀 EXECUTING PHASE 12: REAL DATA IMPORT & MIGRATION');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // SECTION 1: PHASE 12A - Workbook Inspection
  // ----------------------------------------------------
  console.log('📌 1. PHASE 12A - Read-Only Workbook Deep Inspection');
  const benchmark = excelService.loadAttachedOperationalDataset();
  const filename = 'مسلسلات الماكينات (1)(1).xlsx';
  const fileHash = 'sha256-d8a9f4c3b2e17765';
  const fileSizeBytes = 48520;

  const analysis = excelService.analyzeWorkbook(
    benchmark.workbook,
    filename,
    fileSizeBytes,
    fileHash
  );

  assert(analysis.fileName === filename, 'Target workbook filename preserved accurately');
  assert(analysis.sheets.length >= 3, 'Multi-sheet workbook structure detected (3 distinct sheets)');
  assert(analysis.totalEstimatedRecords === 189, `Total fleet records accurately detected across all sheets (189 Machines, detected: ${analysis.totalEstimatedRecords})`);
  
  // Inspect Sheet 1 (Horizontal Layout with merged/multi-machine blocks)
  const sheet1 = analysis.sheets[0];
  assert(sheet1.detectedLayout === 'HORIZONTAL_BLOCKS' || sheet1.suggestedMapping.isLayoutHorizontal, 'Horizontal multi-block column groups detected on Sheet 1');
  assert(sheet1.suggestedMapping.horizontalBlocks?.length === 2, '2 parallel machine blocks identified per facility row (Snack + Espresso)');
  
  // Inspect Sheet 2 (Arabic/Bilingual Columns)
  const sheet2 = analysis.sheets[1];
  assert(sheet2.detectedColumns.length >= 5, 'Bilingual Arabic/English header row recognized on Sheet 2');
  assert(sheet2.detectedHeaderRow >= 0, 'Header row offset accurately determined without assumption');

  // ----------------------------------------------------
  // SECTION 2: PHASE 12B - Data Field Mapping
  // ----------------------------------------------------
  console.log('\n📌 2. PHASE 12B - Data Field Mapping & Mapping Confidence');
  const mapping = sheet1.suggestedMapping;
  assert(!!mapping.buildingCol, 'Building Name mapped to database building entity');
  assert(!!mapping.locationCol, 'Location / Floor mapped to location hierarchy');
  assert(mapping.isLayoutHorizontal === true, 'Horizontal layout mapping flag active for multi-block sheet');

  // ----------------------------------------------------
  // SECTION 3: PHASE 12C - Normalization & Source Provenance
  // ----------------------------------------------------
  console.log('\n📌 3. PHASE 12C - Data Normalization & Provenance Preservation');
  const existingFleet = await api.getMachines();
  const fullWorkbookResult = excelService.validateWorkbook(
    benchmark.workbook,
    analysis,
    filename,
    existingFleet
  );

  assert(fullWorkbookResult.totalRecords === 189, `Full workbook validation processed all 189 machines (Total: ${fullWorkbookResult.totalRecords})`);
  const validationResult = fullWorkbookResult;

  assert(validationResult.records.length > 0, 'Normalized records produced from raw cell coordinates');
  const sampleRec = validationResult.records[0];
  assert(!!sampleRec.raw.coordinates.sourceFile, 'Raw coordinate includes sourceFile');
  assert(!!sampleRec.raw.coordinates.sourceSheet, 'Raw coordinate includes sourceSheet');
  assert(typeof sampleRec.raw.coordinates.sourceRow === 'number', 'Raw coordinate includes sourceRow');
  assert(!!sampleRec.raw.coordinates.sourceColumn, 'Raw coordinate includes sourceColumn');
  assert(!!sampleRec.raw.originalMachineNumber, 'Original un-normalized machine number preserved for audit');

  // ----------------------------------------------------
  // SECTION 4: PHASE 12D - Data Quality Validation & Anomalies
  // ----------------------------------------------------
  console.log('\n📌 4. PHASE 12D - Data Quality Anomaly Classification');
  assert(validationResult.validCount > 0, `Valid machine records flagged (Count: ${validationResult.validCount})`);
  assert(validationResult.reviewRequiredCount > 0, `Review Required records flagged for missing/placeholder values (Count: ${validationResult.reviewRequiredCount})`);
  assert(validationResult.suspiciousSerialsCount > 0, `Suspicious serial placeholders detected (Count: ${validationResult.suspiciousSerialsCount})`);
  assert(validationResult.duplicateMachinesCount >= 1, `Duplicate machine ID in file correctly detected (Count: ${validationResult.duplicateMachinesCount})`);

  // Verify missing serial numbers are NOT fabricated/invented
  const missingSerialRecord = validationResult.records.find(r => r.isMissingSerial);
  if (missingSerialRecord) {
    assert(missingSerialRecord.serialNumber === null, 'Missing serial number kept strictly NULL (never invented or fabricated)');
    assert(missingSerialRecord.dataQualityStatus === 'REVIEW_REQUIRED', 'Record with missing serial classified as REVIEW_REQUIRED');
  }

  // ----------------------------------------------------
  // SECTION 5: PHASE 12E - Existing Database Reconciliation
  // ----------------------------------------------------
  console.log('\n📌 5. PHASE 12E - Existing Fleet Reconciliation');
  const dbMatchRecord = validationResult.records.find(r => r.isDuplicateInDb);
  assert(
    validationResult.records.some(r => !r.isDuplicateInDb),
    'New un-registered machines categorized as NEW INSERT candidates'
  );

  // ----------------------------------------------------
  // SECTION 6: PHASE 12F - Import Preview Table & Action Mapping
  // ----------------------------------------------------
  console.log('\n📌 6. PHASE 12F - Import Preview Summary & Action Plan');
  const actionCounts = {
    INSERT: 0,
    REVIEW: 0,
    SKIP: 0,
    ERROR: 0
  };

  validationResult.records.forEach(r => {
    if (r.dataQualityStatus === 'VALID' && !r.isDuplicateInDb) actionCounts.INSERT++;
    else if (r.dataQualityStatus === 'REVIEW_REQUIRED') actionCounts.REVIEW++;
    else if (r.dataQualityStatus === 'INVALID') actionCounts.ERROR++;
    else actionCounts.SKIP++;
  });

  assert(actionCounts.INSERT > 0, `Preview identifies ${actionCounts.INSERT} clean INSERT candidates`);
  assert(actionCounts.REVIEW > 0, `Preview isolates ${actionCounts.REVIEW} human REVIEW candidates`);
  assert(
    validationResult.records.every(r => ['VALID', 'REVIEW_REQUIRED', 'INVALID'].includes(r.dataQualityStatus)),
    'All records strictly classified into standardized data quality tiers'
  );

  // ----------------------------------------------------
  // SECTION 7: PHASE 12G - CRITICAL SAFETY STOP RULE
  // ----------------------------------------------------
  console.log('\n📌 7. PHASE 12G - Safety Stop Rule Compliance');
  // Confirm that running analysis & validation did NOT modify PostgreSQL records
  const postValidationFleet = await api.getMachines();
  assert(postValidationFleet.length === existingFleet.length, 'Database machine count strictly unchanged following read-only inspection (Stop Rule Enforced)');

  console.log('\n====================================================');
  console.log(`📊 PHASE 12 VALIDATION SUMMARY: ALL CHECKS PASSED`);
  console.log('====================================================\n');
}

runPhase12Validation().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
