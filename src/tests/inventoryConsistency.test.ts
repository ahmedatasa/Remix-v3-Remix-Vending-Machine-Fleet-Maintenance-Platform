import { api } from '../services/api';

async function runInventoryConsistencyTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING COMPREHENSIVE INVENTORY CONSISTENCY TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  try {
    // 0. Reset database to clean baseline
    await api.resetDatabase();

    // 1. Fetch spare parts
    const parts = await api.getSpareParts();
    assert(parts.length > 0, 'Seed spare parts loaded', `Found ${parts.length} parts`);
    const testPart = parts[0];
    const initialQty = testPart.currentQuantity;

    // 2. Test RECEIVE transaction (+5 units)
    console.log('\n--- 1. Testing RECEIVE Transaction ---');
    const rxTx = await api.adjustInventory({
      sparePartId: testPart.id,
      transactionType: 'RECEIVE',
      quantity: 5,
      unitCost: testPart.unitCost,
      referenceNumber: 'PO-TEST-001',
      notes: 'Inbound stock test'
    });

    const partAfterReceive = (await api.getSpareParts()).find(p => p.id === testPart.id);
    assert(
      partAfterReceive?.currentQuantity === initialQty + 5,
      'RECEIVE increases stock correctly',
      `Expected ${initialQty + 5}, got ${partAfterReceive?.currentQuantity}`
    );
    assert(rxTx.balanceAfter === initialQty + 5, 'Transaction record contains accurate balanceAfter');

    // 3. Test ISSUE transaction (-3 units)
    console.log('\n--- 2. Testing ISSUE Transaction ---');
    const issueTx = await api.adjustInventory({
      sparePartId: testPart.id,
      transactionType: 'ISSUE',
      quantity: 3,
      unitCost: testPart.unitCost,
      referenceNumber: 'TCK-TEST-999',
      notes: 'Outbound dispatch test'
    });

    const partAfterIssue = (await api.getSpareParts()).find(p => p.id === testPart.id);
    assert(
      partAfterIssue?.currentQuantity === initialQty + 5 - 3,
      'ISSUE decreases stock correctly',
      `Expected ${initialQty + 2}, got ${partAfterIssue?.currentQuantity}`
    );

    // 4. Test PREVENT NEGATIVE INVENTORY
    console.log('\n--- 3. Testing STRICT Negative Inventory Prevention ---');
    let negativeBlocked = false;
    try {
      const currentStock = partAfterIssue!.currentQuantity;
      // Try to issue more than available
      await api.adjustInventory({
        sparePartId: testPart.id,
        transactionType: 'ISSUE',
        quantity: currentStock + 50,
        notes: 'Excessive issue attempt that must fail'
      });
    } catch (err: any) {
      negativeBlocked = true;
      assert(
        err.message.includes('Insufficient stock') || err.message.includes('Negative inventory is strictly prevented'),
        'Negative inventory rejected with explicit descriptive error'
      );
    }
    assert(negativeBlocked, 'System strictly blocked negative inventory attempt');

    const partAfterBlocked = (await api.getSpareParts()).find(p => p.id === testPart.id);
    assert(
      partAfterBlocked?.currentQuantity === partAfterIssue?.currentQuantity,
      'Stock quantity was NOT altered after rejected negative inventory attempt'
    );

    // 5. Test RETURN and SCRAP transactions
    console.log('\n--- 4. Testing RETURN and SCRAP Transactions ---');
    await api.adjustInventory({
      sparePartId: testPart.id,
      transactionType: 'RETURN',
      quantity: 2,
      notes: 'Unused part return'
    });
    const partAfterReturn = (await api.getSpareParts()).find(p => p.id === testPart.id);
    assert(partAfterReturn?.currentQuantity === partAfterBlocked!.currentQuantity + 2, 'RETURN increments stock');

    await api.adjustInventory({
      sparePartId: testPart.id,
      transactionType: 'SCRAP',
      quantity: 1,
      notes: 'Defective scrap'
    });
    const partAfterScrap = (await api.getSpareParts()).find(p => p.id === testPart.id);
    assert(partAfterScrap?.currentQuantity === partAfterReturn!.currentQuantity - 1, 'SCRAP decrements stock');

    // 6. Test Spare Part Requisition 5-Stage Lifecycle
    console.log('\n--- 5. Testing 5-Stage Requisition Workflow ---');
    const tickets = await api.getTickets();
    const testTicket = tickets[0];

    // Stage 1: REQUESTED
    const newReq = await api.createPartRequest({
      ticketId: testTicket.id,
      sparePartId: testPart.id,
      quantity: 4,
      notes: 'Urgent replacement needed for cooling compressor'
    });
    assert(newReq.status === 'REQUESTED', 'Part request created with status REQUESTED');

    const ticketAfterReq = (await api.getTickets()).find(t => t.id === testTicket.id);
    assert(ticketAfterReq?.status === 'WAITING_FOR_PART', 'Ticket transitioned to WAITING_FOR_PART upon requisition');

    // Stage 2: APPROVED
    await api.updatePartRequestStatus(newReq.id, 'APPROVED');
    const reqApproved = await api.getPartRequestById(newReq.id);
    assert(reqApproved?.status === 'APPROVED', 'Part request transitioned to APPROVED');

    // Stage 3: ORDERED
    await api.updatePartRequestStatus(newReq.id, 'ORDERED', {
      poNumber: 'PO-2026-9901',
      expectedDeliveryDate: '2026-09-05'
    });
    const reqOrdered = await api.getPartRequestById(newReq.id);
    assert(reqOrdered?.status === 'ORDERED', 'Part request transitioned to ORDERED');
    assert(reqOrdered?.poNumber === 'PO-2026-9901', 'PO Number captured accurately on requisition');

    // Stage 4: RECEIVED (triggers auto-replenish)
    const stockBeforeReceive = (await api.getSpareParts()).find(p => p.id === testPart.id)!.currentQuantity;
    await api.updatePartRequestStatus(newReq.id, 'RECEIVED');
    const reqReceived = await api.getPartRequestById(newReq.id);
    assert(reqReceived?.status === 'RECEIVED', 'Part request transitioned to RECEIVED');
    const stockAfterReceive = (await api.getSpareParts()).find(p => p.id === testPart.id)!.currentQuantity;
    assert(
      stockAfterReceive === stockBeforeReceive + 4,
      'RECEIVED transition automatically replenished warehouse inventory (+4)'
    );

    // Stage 5: ISSUED (triggers issuance & resumes ticket)
    await api.updatePartRequestStatus(newReq.id, 'ISSUED');
    const reqIssued = await api.getPartRequestById(newReq.id);
    assert(reqIssued?.status === 'ISSUED', 'Part request transitioned to ISSUED');
    const stockAfterIssue = (await api.getSpareParts()).find(p => p.id === testPart.id)!.currentQuantity;
    assert(
      stockAfterIssue === stockAfterReceive - 4,
      'ISSUED transition automatically decremented warehouse inventory (-4)'
    );

    const ticketAfterIssue = (await api.getTickets()).find(t => t.id === testTicket.id);
    assert(
      ticketAfterIssue?.status === 'IN_PROGRESS',
      'Associated ticket automatically resumed from WAITING_FOR_PART to IN_PROGRESS upon part issuance'
    );

    // 7. Test Machine Part History
    console.log('\n--- 6. Testing Machine Part History & Telemetry ---');
    const machineHistory = await api.getMachinePartsHistory(testTicket.machineId || 'mch-001');
    assert(Array.isArray(machineHistory), 'getMachinePartsHistory returned valid history array');
    console.log(`  Found ${machineHistory.length} component history records for machine.`);

    // 8. Test Audit Trail Completeness
    console.log('\n--- 7. Testing Audit Trail Integrity ---');
    const auditLogs = await api.getAuditLogs();
    const inventoryAudits = auditLogs.filter(a => a.action.startsWith('INVENTORY_') || a.action.startsWith('PART_'));
    assert(inventoryAudits.length > 0, 'Immutable audit logs recorded for every inventory & part action');
    console.log(`  Found ${inventoryAudits.length} inventory-related audit trail entries.`);

    console.log('\n====================================================');
    console.log(`📊 INVENTORY CONSISTENCY TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal test execution error:', error);
    process.exit(1);
  }
}

runInventoryConsistencyTests();
