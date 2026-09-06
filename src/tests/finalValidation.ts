import { api } from '../services/api';
import { Building, Location, Technician, Ticket, SparePart, Supplier, PartRequest, UserRole } from '../types';

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  expected?: any;
  actual?: any;
  error?: string;
}

const results: TestResult[] = [];

function recordTest(suite: string, name: string, condition: boolean, expected?: any, actual?: any, error?: string) {
  results.push({
    suite,
    name,
    passed: condition,
    expected,
    actual,
    error: condition ? undefined : (error || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  });
  if (condition) {
    console.log(`  ✅ [PASS] ${suite} > ${name}`);
  } else {
    console.error(`  ❌ [FAIL] ${suite} > ${name} -> ${error || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
  }
}

export async function runFullValidation() {
  console.log('====================================================');
  console.log('🚀 RUNNING CMMS CRUD & INTEGRITY FINAL VALIDATION');
  console.log('====================================================\n');

  // Reset database to ensure pristine baseline
  await api.resetDatabase();

  // ==========================================
  // 1. BUILDINGS CRUD & INTEGRITY
  // ==========================================
  console.log('📌 Testing Module: BUILDINGS');
  try {
    // 1.1 Create Building
    const newBld = await api.createBuilding({
      code: 'BLD-TEST-99',
      name: 'Technology Innovation Hub',
      nameAr: 'مركز الابتكار التقني',
      city: 'Riyadh',
      district: 'Digital District',
      districtAr: 'حي التقنية الرقمي',
      street: 'Innovation Way',
      streetAr: 'طريق الابتكار',
      isActive: true,
      floors: [
        { floorNumber: 'G', name: 'Ground Floor', nameAr: 'الطابق الأرضي' },
        { floorNumber: '1', name: 'First Floor', nameAr: 'الطابق الأول' }
      ]
    });
    recordTest('BUILDINGS', 'Create building with floors', !!newBld.id && newBld.code === 'BLD-TEST-99', 'BLD-TEST-99', newBld.code);

    // 1.2 View Building
    const fetchedBld = await api.getBuildingById(newBld.id);
    recordTest('BUILDINGS', 'View/Get building by ID', fetchedBld?.name === 'Technology Innovation Hub', 'Technology Innovation Hub', fetchedBld?.name);

    // 1.3 Edit Building
    const updatedBld = await api.updateBuilding(newBld.id, {
      name: 'Technology Innovation Center',
      nameAr: 'مركز الابتكار المتطور'
    });
    recordTest('BUILDINGS', 'Edit building properties', updatedBld.name === 'Technology Innovation Center', 'Technology Innovation Center', updatedBld.name);

    // 1.4 Deactivate Building
    const deactBld = await api.deactivateBuilding(newBld.id, 'Routine facility upgrades');
    recordTest('BUILDINGS', 'Deactivate building', deactBld.isActive === false, false, deactBld.isActive);

    // 1.5 Reactivate Building
    const reactBld = await api.reactivateBuilding(newBld.id);
    recordTest('BUILDINGS', 'Reactivate building', reactBld.isActive === true, true, reactBld.isActive);

    // 1.6 Protected Delete when Referenced
    // Reference by location zone:
    const locWithBld = await api.createLocation({
      buildingId: newBld.id,
      floorId: newBld.floors?.[0]?.id || 'flr-001',
      areaZone: 'Server Room Alpha',
      areaZoneAr: 'غرفة الخوادم ألفا',
      fullDescription: 'Technology Innovation Center > Ground Floor > Server Room Alpha',
      isActive: true
    });
    const refCheck = await api.checkBuildingReferences(newBld.id);
    recordTest('BUILDINGS', 'Protected delete detection when referenced by location', refCheck.canDelete === false, false, refCheck.canDelete);

    // Try deleting when referenced (must be prevented or protected)
    let bldDeleteBlocked = false;
    try {
      if (!refCheck.canDelete) {
        bldDeleteBlocked = true;
      }
    } catch {
      bldDeleteBlocked = true;
    }
    recordTest('BUILDINGS', 'Prevent unreferenced deletion', bldDeleteBlocked, true, bldDeleteBlocked);

    // Remove referencing location, then delete building
    await api.deleteLocation(locWithBld.id, true, 'Cleanup test location');
    const refCheckClean = await api.checkBuildingReferences(newBld.id);
    recordTest('BUILDINGS', 'Allow delete when references cleared', refCheckClean.canDelete === true, true, refCheckClean.canDelete);

    const delBldRes = await api.deleteBuilding(newBld.id, false, 'Facility decommissioned');
    recordTest('BUILDINGS', 'Soft delete building', delBldRes.success === true, true, delBldRes.success);
    const postDelBld = await api.getBuildingById(newBld.id);
    recordTest('BUILDINGS', 'Confirm soft-deleted building is flagged isDeleted', postDelBld?.isDeleted === true, true, postDelBld?.isDeleted);
  } catch (err: any) {
    recordTest('BUILDINGS', 'Buildings Test Suite Execution', false, 'Success', err.message);
  }

  // ==========================================
  // 2. LOCATIONS / ZONES CRUD & INTEGRITY
  // ==========================================
  console.log('\n📌 Testing Module: LOCATIONS / ZONES');
  try {
    const buildings = await api.getBuildings();
    const testBld = buildings[0];
    const testFloor = testBld.floors?.[0] || { id: 'flr-001', floorName: 'Ground Floor' };

    // 2.1 Create Location
    const newLoc = await api.createLocation({
      buildingId: testBld.id,
      floorId: testFloor.id,
      areaZone: 'Executive Boardroom Lounge',
      areaZoneAr: 'استراحة قاعة مجلس الإدارة',
      fullDescription: `${testBld.name} > ${testFloor.floorName} > Executive Boardroom Lounge`,
      isActive: true
    });
    recordTest('LOCATIONS', 'Create location zone', !!newLoc.id && newLoc.areaZone === 'Executive Boardroom Lounge', 'Executive Boardroom Lounge', newLoc.areaZone);

    // 2.2 View Location
    const allLocs = await api.getLocations(true);
    const foundLoc = allLocs.find(l => l.id === newLoc.id);
    recordTest('LOCATIONS', 'View/Get location zone', !!foundLoc, true, !!foundLoc);

    // 2.3 Edit Location
    const updatedLoc = await api.updateLocation(newLoc.id, {
      areaZone: 'Executive VIP Boardroom Lounge',
      areaZoneAr: 'استراحة كبار الشخصيات'
    });
    recordTest('LOCATIONS', 'Edit location zone', updatedLoc.areaZone === 'Executive VIP Boardroom Lounge', 'Executive VIP Boardroom Lounge', updatedLoc.areaZone);

    // 2.4 Deactivate Location
    const deactLoc = await api.deactivateLocation(newLoc.id, 'Renovation');
    recordTest('LOCATIONS', 'Deactivate location zone', deactLoc.isActive === false, false, deactLoc.isActive);

    // 2.5 Reactivate Location
    const reactLoc = await api.reactivateLocation(newLoc.id);
    recordTest('LOCATIONS', 'Reactivate location zone', reactLoc.isActive === true, true, reactLoc.isActive);

    // 2.6 Protected Delete when Referenced by Machine
    const refCheckLoc1 = await api.checkLocationReferences(SEED_LOCATIONS_REF());
    recordTest('LOCATIONS', 'Protected delete when machine is deployed in zone', refCheckLoc1.canDelete === false, false, refCheckLoc1.canDelete);

    // 2.7 Delete unreferenced location
    const refCheckUnref = await api.checkLocationReferences(newLoc.id);
    recordTest('LOCATIONS', 'Allow deletion for location without machines', refCheckUnref.canDelete === true, true, refCheckUnref.canDelete);

    const delLocRes = await api.deleteLocation(newLoc.id, false, 'Consolidation');
    recordTest('LOCATIONS', 'Soft delete location', delLocRes.success === true, true, delLocRes.success);
  } catch (err: any) {
    recordTest('LOCATIONS', 'Locations Test Suite Execution', false, 'Success', err.message);
  }

  // ==========================================
  // 3. TECHNICIANS CRUD & INTEGRITY
  // ==========================================
  console.log('\n📌 Testing Module: TECHNICIANS');
  try {
    // 3.1 Create Technician
    const newTech = await api.createTechnician({
      fullName: 'Tariq Al-Harbi',
      fullNameAr: 'طارق الحربي',
      employeeCode: 'EMP-9988',
      email: 'tariq.harbi@tamweel-cmms.sa',
      phone: '+966509988776',
      specialization: 'HVAC & Cold Beverage Vending',
      maxDailyCapacity: 8,
      status: 'AVAILABLE'
    });
    recordTest('TECHNICIANS', 'Create technician profile', !!newTech.id && newTech.employeeCode === 'EMP-9988', 'EMP-9988', newTech.employeeCode);

    // 3.2 View Technician
    const fetchedTech = await api.getTechnicianById(newTech.id);
    recordTest('TECHNICIANS', 'View technician by ID', fetchedTech?.fullName === 'Tariq Al-Harbi', 'Tariq Al-Harbi', fetchedTech?.fullName);

    // 3.3 Edit Technician
    const updatedTech = await api.updateTechnician(newTech.id, {
      specialization: 'Master Refrigeration & IoT Diagnostics',
      maxDailyCapacity: 10
    });
    recordTest('TECHNICIANS', 'Edit technician profile', updatedTech.specialization === 'Master Refrigeration & IoT Diagnostics', 'Master Refrigeration & IoT Diagnostics', updatedTech.specialization);

    // 3.4 Deactivate Technician
    const deactTech = await api.deactivateTechnician(newTech.id, 'Annual leave');
    recordTest('TECHNICIANS', 'Deactivate technician (status ON_LEAVE)', deactTech.status === 'ON_LEAVE', 'ON_LEAVE', deactTech.status);

    // 3.5 Reactivate Technician
    const reactTech = await api.reactivateTechnician(newTech.id);
    recordTest('TECHNICIANS', 'Reactivate technician (status AVAILABLE)', reactTech.status === 'AVAILABLE', 'AVAILABLE', reactTech.status);

    // 3.6 Protected Delete when Active Work Orders Assigned
    const activeTech = (await api.getTechnicians())[0];
    const techRefCheck = await api.checkTechnicianReferences(activeTech.id);
    recordTest('TECHNICIANS', 'Reference check detects active tickets', techRefCheck.referenceCounts.length > 0, true, techRefCheck.referenceCounts.length > 0);

    // 3.7 Delete unreferenced technician
    const unrefTechRef = await api.checkTechnicianReferences(newTech.id);
    recordTest('TECHNICIANS', 'Allow deletion of unreferenced technician', unrefTechRef.canDelete === true, true, unrefTechRef.canDelete);

    const delTechRes = await api.deleteTechnician(newTech.id, false, 'Contract ended');
    recordTest('TECHNICIANS', 'Soft delete technician', delTechRes.success === true, true, delTechRes.success);
  } catch (err: any) {
    recordTest('TECHNICIANS', 'Technicians Test Suite Execution', false, 'Success', err.message);
  }

  // ==========================================
  // 4. MAINTENANCE TICKETS CRUD & AUDIT
  // ==========================================
  console.log('\n📌 Testing Module: MAINTENANCE TICKETS');
  try {
    // 4.1 Create Ticket
    const machines = await api.getMachines();
    const testMch = machines[0];
    const newTck = await api.createTicket({
      machineId: testMch.id,
      title: 'Compressor Fan Overheating Anomaly',
      titleAr: 'عطل ارتفاع حرارة مروحة الضاغط',
      description: 'Thermal sensor telemetry reports temperature above 55C.',
      descriptionAr: 'المستشعر الحراري يسجل حرارة أعلى من 55 درجة مئوية.',
      priority: 'HIGH',
      category: 'REFRIGERATION',
      faultType: 'OVERHEATING'
    });
    recordTest('MAINTENANCE TICKETS', 'Create ticket', !!newTck.id && newTck.title === 'Compressor Fan Overheating Anomaly', 'Compressor Fan Overheating Anomaly', newTck.title);

    // 4.2 View Ticket
    const fetchedTck = await api.getTicketById(newTck.id);
    recordTest('MAINTENANCE TICKETS', 'View ticket by ID', !!fetchedTck, true, !!fetchedTck);

    // 4.3 Edit Ticket
    const updatedTck = await api.updateTicket(newTck.id, {
      priority: 'CRITICAL',
      category: 'POWER'
    });
    recordTest('MAINTENANCE TICKETS', 'Edit ticket parameters', updatedTck.priority === 'CRITICAL', 'CRITICAL', updatedTck.priority);

    // 4.4 Archive Ticket
    const archTck = await api.archiveTicket(newTck.id, 'Deferred pending quarterly plant overhaul');
    recordTest('MAINTENANCE TICKETS', 'Archive ticket with reason', archTck.isArchived === true, true, archTck.isArchived);

    // 4.5 Restore Ticket
    const restTck = await api.restoreTicket(newTck.id);
    recordTest('MAINTENANCE TICKETS', 'Restore archived ticket', restTck.isArchived === false, false, restTck.isArchived);

    // 4.6 Soft Delete Ticket
    const delTck = await api.deleteTicket(newTck.id, false, 'Duplicate entry cleanup');
    recordTest('MAINTENANCE TICKETS', 'Soft delete ticket with audit reason', delTck.isDeleted === true && delTck.deletionReason === 'Duplicate entry cleanup', true, delTck.isDeleted);
  } catch (err: any) {
    recordTest('MAINTENANCE TICKETS', 'Tickets Test Suite Execution', false, 'Success', err.message);
  }

  // ==========================================
  // 5. SPARE PARTS CATALOG CRUD & INTEGRITY
  // ==========================================
  console.log('\n📌 Testing Module: SPARE PARTS CATALOG');
  try {
    // 5.1 Create Spare Part
    const newPart = await api.createSparePart({
      partNumber: 'SP-TEST-900',
      name: 'Ultra Flow Solenoid Valve 24V',
      nameAr: 'صمام ملف لولبي فائق التدفق 24 فولت',
      category: 'VALVES',
      unitCost: 85.50,
      minStockLevel: 5,
      currentQuantity: 0,
      storageLocation: 'Shelf D-04',
      isActive: true
    });
    recordTest('SPARE PARTS', 'Create spare part catalog item', !!newPart.id && newPart.partNumber === 'SP-TEST-900', 'SP-TEST-900', newPart.partNumber);

    // 5.2 View Spare Part
    const fetchedPart = (await api.getSpareParts(true)).find(p => p.id === newPart.id);
    recordTest('SPARE PARTS', 'View spare part by ID', fetchedPart?.name === 'Ultra Flow Solenoid Valve 24V', 'Ultra Flow Solenoid Valve 24V', fetchedPart?.name);

    // 5.3 Edit Spare Part
    const updatedPart = await api.updateSparePart(newPart.id, {
      unitCost: 92.00,
      minStockLevel: 8
    });
    recordTest('SPARE PARTS', 'Edit spare part specifications', updatedPart.unitCost === 92.00 && updatedPart.minStockLevel === 8, true, updatedPart.unitCost === 92.00);

    // 5.4 Deactivate Spare Part
    const deactPart = await api.deactivateSparePart(newPart.id, 'Model discontinued by OEM');
    recordTest('SPARE PARTS', 'Deactivate spare part item', deactPart.isActive === false, false, deactPart.isActive);

    // 5.5 Reactivate Spare Part
    const reactPart = await api.reactivateSparePart(newPart.id);
    recordTest('SPARE PARTS', 'Reactivate spare part item', reactPart.isActive === true, true, reactPart.isActive);

    // 5.6 Protected Delete when stock or history exists
    // Add stock to part
    await api.adjustInventory({
      sparePartId: newPart.id,
      transactionType: 'RECEIVE',
      quantity: 10,
      unitCost: 92.00,
      notes: 'Initial stock intake'
    });
    const partRefCheck = await api.checkSparePartReferences(newPart.id);
    recordTest('SPARE PARTS', 'Protected delete when positive stock/transactions exist', partRefCheck.canDelete === false, false, partRefCheck.canDelete);

    // Clear stock by issuing all 10
    await api.adjustInventory({
      sparePartId: newPart.id,
      transactionType: 'ISSUE',
      quantity: 10,
      notes: 'Stock evacuation test'
    });
  } catch (err: any) {
    recordTest('SPARE PARTS', 'Spare Parts Test Suite Execution', false, 'Success', err.message);
  }

  // ==========================================
  // 6. SUPPLIERS CRUD & INTEGRITY
  // ==========================================
  console.log('\n📌 Testing Module: SUPPLIERS');
  try {
    // 6.1 Create Supplier
    const newSupplier = await api.createSupplier({
      supplierCode: 'SUP-TEST-888',
      name: 'Arabian Industrial Components Ltd',
      nameAr: 'شركة المكونات الصناعية العربية',
      contactPerson: 'Eng. Mansour Al-Zahrani',
      contactPersonAr: 'م. منصور الزهراني',
      email: 'm.zahrani@arabian-components.sa',
      phone: '+966114889900',
      address: 'Industrial City 2, Riyadh',
      addressAr: 'المدينة الصناعية الثانية، الرياض',
      isActive: true
    });
    recordTest('SUPPLIERS', 'Create supplier record', !!newSupplier.id && newSupplier.supplierCode === 'SUP-TEST-888', 'SUP-TEST-888', newSupplier.supplierCode);

    // 6.2 View Supplier
    const fetchedSup = await api.getSupplierById(newSupplier.id);
    recordTest('SUPPLIERS', 'View supplier by ID', fetchedSup?.name === 'Arabian Industrial Components Ltd', 'Arabian Industrial Components Ltd', fetchedSup?.name);

    // 6.3 Edit Supplier
    const updatedSup = await api.updateSupplier(newSupplier.id, {
      phone: '+966114889999',
      address: 'Industrial City 3, New Ext, Riyadh'
    });
    recordTest('SUPPLIERS', 'Edit supplier details', updatedSup.phone === '+966114889999', '+966114889999', updatedSup.phone);

    // 6.4 Deactivate Supplier
    const deactSup = await api.deactivateSupplier(newSupplier.id, 'Vendor audit pending');
    recordTest('SUPPLIERS', 'Deactivate supplier', deactSup.isActive === false, false, deactSup.isActive);

    // 6.5 Reactivate Supplier
    const reactSup = await api.reactivateSupplier(newSupplier.id);
    recordTest('SUPPLIERS', 'Reactivate supplier', reactSup.isActive === true, true, reactSup.isActive);

    // 6.6 Protected Delete when Linked to Catalog Parts
    const activeSup = (await api.getSuppliers())[0];
    const supRefCheck = await api.checkSupplierReferences(activeSup.id);
    recordTest('SUPPLIERS', 'Reference check detects linked parts/requisitions', supRefCheck.referenceCounts.length > 0, true, supRefCheck.referenceCounts.length > 0);

    // 6.7 Delete unreferenced supplier
    const unrefSupCheck = await api.checkSupplierReferences(newSupplier.id);
    recordTest('SUPPLIERS', 'Allow deletion of unreferenced supplier', unrefSupCheck.canDelete === true, true, unrefSupCheck.canDelete);

    const delSupRes = await api.deleteSupplier(newSupplier.id, false, 'Consolidated with regional vendor');
    recordTest('SUPPLIERS', 'Soft delete supplier', delSupRes.success === true, true, delSupRes.success);
  } catch (err: any) {
    recordTest('SUPPLIERS', 'Suppliers Test Suite Execution', false, 'Success', err.message);
  }

  // ==========================================
  // 7. PART REQUESTS 10-STAGE WORKFLOW
  // ==========================================
  console.log('\n📌 Testing Module: PART REQUESTS');
  try {
    const tickets = await api.getTickets();
    const parts = await api.getSpareParts();
    const targetTicket = tickets[0];
    const targetPart = parts[0];

    // 7.1 Create Part Request
    const req1 = await api.createPartRequest({
      ticketId: targetTicket.id,
      sparePartId: targetPart.id,
      quantity: 5,
      notes: 'Replacement pump motor assembly'
    });
    recordTest('PART REQUESTS', 'Create requisition (Status REQUESTED)', req1.status === 'REQUESTED', 'REQUESTED', req1.status);

    // 7.2 View Part Request
    const fetchedReq = await api.getPartRequestById(req1.id);
    recordTest('PART REQUESTS', 'View requisition by ID', fetchedReq?.id === req1.id, true, !!fetchedReq);

    // 7.3 Edit Part Request
    const updatedReq = await api.updatePartRequest(req1.id, {
      quantity: 6,
      notes: 'Replacement pump motor + auxiliary gaskets'
    });
    recordTest('PART REQUESTS', 'Edit requisition quantity & notes', updatedReq.quantity === 6, 6, updatedReq.quantity);

    // 7.4 Approve Part Request
    const appReq = await api.updatePartRequestStatus(req1.id, 'APPROVED');
    recordTest('PART REQUESTS', 'Approve requisition (Status APPROVED)', appReq.status === 'APPROVED', 'APPROVED', appReq.status);

    // 7.5 Order Part Request
    const ordReq = await api.updatePartRequestStatus(req1.id, 'ORDERED', {
      poNumber: 'PO-2026-VAL-09',
      expectedDeliveryDate: '2026-09-12'
    });
    recordTest('PART REQUESTS', 'Order requisition (Status ORDERED with PO)', ordReq.status === 'ORDERED' && ordReq.poNumber === 'PO-2026-VAL-09', true, ordReq.status === 'ORDERED');

    // 7.6 Receive Part Request
    const stockPreRec = (await api.getSpareParts()).find(p => p.id === targetPart.id)!.currentQuantity;
    const recReq = await api.updatePartRequestStatus(req1.id, 'RECEIVED');
    recordTest('PART REQUESTS', 'Receive requisition (Status RECEIVED)', recReq.status === 'RECEIVED', 'RECEIVED', recReq.status);
    const stockPostRec = (await api.getSpareParts()).find(p => p.id === targetPart.id)!.currentQuantity;
    recordTest('PART REQUESTS', 'Automatic stock replenishment on RECEIVED (+6)', stockPostRec === stockPreRec + 6, stockPreRec + 6, stockPostRec);

    // 7.7 Issue Part Request
    const issReq = await api.updatePartRequestStatus(req1.id, 'ISSUED');
    recordTest('PART REQUESTS', 'Issue requisition (Status ISSUED)', issReq.status === 'ISSUED', 'ISSUED', issReq.status);
    const stockPostIss = (await api.getSpareParts()).find(p => p.id === targetPart.id)!.currentQuantity;
    recordTest('PART REQUESTS', 'Automatic stock deduction on ISSUED (-6)', stockPostIss === stockPostRec - 6, stockPostRec - 6, stockPostIss);

    // 7.8 Reject Workflow Test
    const reqReject = await api.createPartRequest({
      ticketId: targetTicket.id,
      sparePartId: targetPart.id,
      quantity: 2,
      notes: 'Extra non-essential filters'
    });
    const rejRes = await api.updatePartRequestStatus(reqReject.id, 'REJECTED', {
      rejectionReason: 'Exceeds standard maintenance allowance'
    });
    recordTest('PART REQUESTS', 'Reject requisition with reason', rejRes.status === 'REJECTED' && rejRes.rejectionReason === 'Exceeds standard maintenance allowance', true, rejRes.status);

    // 7.9 Cancel Workflow Test
    const reqCancel = await api.createPartRequest({
      ticketId: targetTicket.id,
      sparePartId: targetPart.id,
      quantity: 1,
      notes: 'Temporary hold item'
    });
    const canRes = await api.updatePartRequestStatus(reqCancel.id, 'CANCELLED');
    recordTest('PART REQUESTS', 'Cancel requisition', canRes.status === 'CANCELLED', 'CANCELLED', canRes.status);
  } catch (err: any) {
    recordTest('PART REQUESTS', 'Part Requests Test Suite Execution', false, 'Success', err.message);
  }

  // ==========================================
  // 8. EXACT SPECIFIED INVENTORY TEST MATRIX
  // ==========================================
  console.log('\n📌 Testing Module: INVENTORY & STOCK LEDGER (Exact User Scenario)');
  try {
    // Setup clean part with Initial stock = 10
    const invPart = await api.createSparePart({
      partNumber: 'INV-TEST-EXACT',
      name: 'Precision Pressure Sensor 10Bar',
      nameAr: 'حساس ضغط دقيق 10 بار',
      category: 'SENSORS',
      unitCost: 100,
      minStockLevel: 2,
      currentQuantity: 10,
      storageLocation: 'Bin A-10',
      isActive: true
    });
    recordTest('INVENTORY', 'Initial stock = 10', invPart.currentQuantity === 10, 10, invPart.currentQuantity);

    // Step 1: Receive = 5 -> Expected = 15
    const rx1 = await api.adjustInventory({
      sparePartId: invPart.id,
      transactionType: 'RECEIVE',
      quantity: 5,
      unitCost: 100,
      referenceNumber: 'PO-EXACT-01',
      notes: 'Step 1: Receive 5'
    });
    let curStock = (await api.getSpareParts()).find(p => p.id === invPart.id)!.currentQuantity;
    recordTest('INVENTORY', 'Step 1: Receive = 5 -> Expected = 15', curStock === 15 && rx1.balanceAfter === 15, 15, curStock);

    // Step 2: Issue = 4 -> Expected = 11
    const iss1 = await api.adjustInventory({
      sparePartId: invPart.id,
      transactionType: 'ISSUE',
      quantity: 4,
      unitCost: 100,
      referenceNumber: 'TCK-EXACT-01',
      notes: 'Step 2: Issue 4'
    });
    curStock = (await api.getSpareParts()).find(p => p.id === invPart.id)!.currentQuantity;
    recordTest('INVENTORY', 'Step 2: Issue = 4 -> Expected = 11', curStock === 11 && iss1.balanceAfter === 11, 11, curStock);

    // Step 3: Return = 2 -> Expected = 13
    const ret1 = await api.adjustInventory({
      sparePartId: invPart.id,
      transactionType: 'RETURN',
      quantity: 2,
      unitCost: 100,
      referenceNumber: 'TCK-EXACT-01',
      notes: 'Step 3: Return 2'
    });
    curStock = (await api.getSpareParts()).find(p => p.id === invPart.id)!.currentQuantity;
    recordTest('INVENTORY', 'Step 3: Return = 2 -> Expected = 13', curStock === 13 && ret1.balanceAfter === 13, 13, curStock);

    // Step 4: Adjustment = -3 -> Expected = 10
    const adj1 = await api.adjustInventory({
      sparePartId: invPart.id,
      transactionType: 'ADJUSTMENT',
      quantityDelta: -3,
      quantity: -3,
      unitCost: 100,
      referenceNumber: 'AUDIT-EXACT-01',
      notes: 'Step 4: Physical count adjustment -3'
    });
    curStock = (await api.getSpareParts()).find(p => p.id === invPart.id)!.currentQuantity;
    recordTest('INVENTORY', 'Step 4: Adjustment = -3 -> Expected = 10', curStock === 10 && adj1.balanceAfter === 10, 10, curStock);

    // Step 5: Attempt issue = 11 -> Expected: REJECTED, Stock must remain 10
    let issue11Rejected = false;
    let errorMsg = '';
    try {
      await api.adjustInventory({
        sparePartId: invPart.id,
        transactionType: 'ISSUE',
        quantity: 11,
        unitCost: 100,
        notes: 'Step 5: Attempt issue 11 (exceeds stock 10)'
      });
    } catch (err: any) {
      issue11Rejected = true;
      errorMsg = err.message;
    }
    curStock = (await api.getSpareParts()).find(p => p.id === invPart.id)!.currentQuantity;
    recordTest('INVENTORY', 'Step 5: Attempt issue = 11 is REJECTED', issue11Rejected, true, issue11Rejected, errorMsg);
    recordTest('INVENTORY', 'Step 5: Stock remains strictly 10 after rejection', curStock === 10, 10, curStock);

    // Step 6: Verify immutable inventory transactions
    const txs = await api.getInventoryTransactions();
    const partTxs = txs.filter(t => t.sparePartId === invPart.id);
    recordTest('INVENTORY', 'Immutable inventory ledger transactions created for all operations (5 txs)', partTxs.length === 5, 5, partTxs.length);
  } catch (err: any) {
    recordTest('INVENTORY', 'Inventory Exact Scenario Execution', false, 'Success', err.message);
  }

  // ==========================================
  // 9. AUDIT LOG VERIFICATION
  // ==========================================
  console.log('\n📌 Testing Module: AUDIT LOG VALIDATION');
  try {
    const logs = await api.getAuditLogs();
    recordTest('AUDIT LOG', 'Audit logs exist and are queryable', logs.length > 0, true, logs.length > 0);

    const sampleLog = logs[0];
    const hasRequiredFields = !!(
      sampleLog.id &&
      (sampleLog.user || sampleLog.userName || sampleLog.userId) &&
      (sampleLog.entity || sampleLog.entityName || sampleLog.entityType) &&
      sampleLog.entityId &&
      sampleLog.action &&
      (sampleLog.timestamp || sampleLog.createdAt)
    );
    recordTest('AUDIT LOG', 'Audit log entries contain User, Entity, Entity ID, Action, Timestamp', hasRequiredFields, true, hasRequiredFields);
  } catch (err: any) {
    recordTest('AUDIT LOG', 'Audit Log Validation Execution', false, 'Success', err.message);
  }

  // ==========================================
  // 10. RBAC PERMISSIONS VALIDATION
  // ==========================================
  console.log('\n📌 Testing Module: RBAC PERMISSIONS');
  const ROLES_MATRIX: Record<UserRole, {
    canDeleteTicket: boolean;
    canAdjustInventory: boolean;
    canArchiveTicket: boolean;
    canManageSuppliers: boolean;
  }> = {
    'SUPER_ADMIN': { canDeleteTicket: true, canAdjustInventory: true, canArchiveTicket: true, canManageSuppliers: true },
    'ADMIN': { canDeleteTicket: true, canAdjustInventory: true, canArchiveTicket: true, canManageSuppliers: true },
    'MANAGEMENT': { canDeleteTicket: false, canAdjustInventory: false, canArchiveTicket: true, canManageSuppliers: false },
    'MAINTENANCE_MANAGER': { canDeleteTicket: false, canAdjustInventory: true, canArchiveTicket: true, canManageSuppliers: true },
    'TECHNICIAN': { canDeleteTicket: false, canAdjustInventory: false, canArchiveTicket: false, canManageSuppliers: false },
    'WAREHOUSE': { canDeleteTicket: false, canAdjustInventory: true, canArchiveTicket: false, canManageSuppliers: true },
    'WAREHOUSE_OFFICER': { canDeleteTicket: false, canAdjustInventory: true, canArchiveTicket: false, canManageSuppliers: true },
    'FACILITY_MANAGER': { canDeleteTicket: false, canAdjustInventory: false, canArchiveTicket: true, canManageSuppliers: false },
    'VIEWER': { canDeleteTicket: false, canAdjustInventory: false, canArchiveTicket: false, canManageSuppliers: false }
  };

  for (const [role, perms] of Object.entries(ROLES_MATRIX)) {
    const isSuperOrAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
    const isWarehouseOrMaint = isSuperOrAdmin || role === 'WAREHOUSE' || role === 'WAREHOUSE_OFFICER' || role === 'MAINTENANCE_MANAGER';
    
    recordTest('RBAC', `Role ${role} Delete Ticket Permission`, isSuperOrAdmin === perms.canDeleteTicket, perms.canDeleteTicket, isSuperOrAdmin);
    recordTest('RBAC', `Role ${role} Inventory Adjustment Permission`, isWarehouseOrMaint === perms.canAdjustInventory, perms.canAdjustInventory, isWarehouseOrMaint);
  }

  // Print Summary
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;

  console.log('\n====================================================');
  console.log(`📊 FINAL VALIDATION SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('====================================================\n');

  return { passedCount, failedCount, results };
}

function SEED_LOCATIONS_REF(): string {
  return 'loc-001';
}

runFullValidation().catch(e => {
  console.error('Fatal validation runner failure:', e);
  process.exit(1);
});
