import {
  validateLatitude,
  validateLongitude,
  validateCoordinates,
  normalizeCoordinates
} from '../utils/geoValidation';
import { api } from '../services/api';

async function runBuildingLocationTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING BUILDING LOCATION & GPS INTEGRATION TESTS');
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
    // ---------------------------------------------------------------
    // 1. Validation Logic Unit Tests
    // ---------------------------------------------------------------
    console.log('\n--- 1. Testing Coordinate Validation Logic ---');

    // Latitude boundaries
    assert(validateLatitude(24.7255).valid, 'Valid latitude (24.7255) accepted');
    assert(validateLatitude(90).valid, 'North pole boundary (90) accepted');
    assert(validateLatitude(-90).valid, 'South pole boundary (-90) accepted');
    assert(!validateLatitude(90.0001).valid, 'Latitude > 90 rejected');
    assert(!validateLatitude(-90.0001).valid, 'Latitude < -90 rejected');
    assert(!validateLatitude(NaN).valid, 'NaN latitude rejected');

    // Longitude boundaries
    assert(validateLongitude(46.6235).valid, 'Valid longitude (46.6235) accepted');
    assert(validateLongitude(180).valid, 'Antimeridian boundary (180) accepted');
    assert(validateLongitude(-180).valid, 'Antimeridian boundary (-180) accepted');
    assert(!validateLongitude(180.0001).valid, 'Longitude > 180 rejected');
    assert(!validateLongitude(-180.0001).valid, 'Longitude < -180 rejected');
    assert(!validateLongitude(NaN).valid, 'NaN longitude rejected');

    // Optional GPS (null coordinates are valid)
    const nullCoordsResult = validateCoordinates(null, null);
    assert(nullCoordsResult.valid, 'Null coordinates are valid (Optional GPS guarantee)');
    assert(nullCoordsResult.isConfigured === false, 'Null coordinates report isConfigured = false');

    // Half-configured coordinates are invalid
    const partialLatResult = validateCoordinates(24.7255, null);
    assert(!partialLatResult.valid, 'Latitude without longitude rejected');
    const partialLngResult = validateCoordinates(null, 46.6235);
    assert(!partialLngResult.valid, 'Longitude without latitude rejected');

    // Coordinate normalization
    const norm = normalizeCoordinates(24.72554321, 46.62358765);
    assert(norm.latitude === 24.725543, 'Latitude normalized to 6 decimals');
    assert(norm.longitude === 46.623588, 'Longitude normalized to 6 decimals');

    // ---------------------------------------------------------------
    // 2. Building Creation with Null GPS (Zero Fake GPS Guarantee)
    // ---------------------------------------------------------------
    console.log('\n--- 2. Testing Building Creation with Null GPS ---');
    const bldWithoutGps = await api.createBuilding({
      name: 'Engineering Research Center',
      nameAr: 'مركز بحوث الهندسة',
      code: `BLD-ERC-${Date.now().toString().slice(-4)}`,
      address: 'North Campus, Zone B',
      latitude: null,
      longitude: null,
      locationNote: 'Under construction - GPS pending survey'
    });

    assert(bldWithoutGps.id.startsWith('bld-'), 'Building created with valid ID');
    assert(bldWithoutGps.latitude === null, 'Building latitude is strictly null');
    assert(bldWithoutGps.longitude === null, 'Building longitude is strictly null');
    assert(
      bldWithoutGps.locationStatus === 'LOCATION_NOT_CONFIGURED',
      'Building locationStatus is LOCATION_NOT_CONFIGURED'
    );
    assert(
      bldWithoutGps.locationSource === 'NONE',
      'Building locationSource is NONE when no GPS provided'
    );

    // ---------------------------------------------------------------
    // 3. Building Creation with Valid Authoritative GPS
    // ---------------------------------------------------------------
    console.log('\n--- 3. Testing Building Creation with Valid GPS ---');
    const bldWithGps = await api.createBuilding({
      name: 'Central Administration Complex',
      nameAr: 'مجمع الإدارة المركزية',
      code: `BLD-ADM-${Date.now().toString().slice(-4)}`,
      address: 'Main Boulevard, Gate 1',
      latitude: 24.724123,
      longitude: 46.626456,
      locationSource: 'MAP_PICKER',
      locationNote: 'Pin placed precisely at main rotunda entrance'
    });

    assert(bldWithGps.latitude === 24.724123, 'Building latitude persisted correctly');
    assert(bldWithGps.longitude === 46.626456, 'Building longitude persisted correctly');
    assert(
      bldWithGps.locationStatus === 'GPS_CONFIGURED',
      'Building locationStatus is GPS_CONFIGURED'
    );
    assert(
      bldWithGps.locationSource === 'MAP_PICKER',
      'Building locationSource persisted as MAP_PICKER'
    );
    assert(
      bldWithGps.locationNote === 'Pin placed precisely at main rotunda entrance',
      'Building locationNote persisted'
    );

    // ---------------------------------------------------------------
    // 4. Updating Building GPS and Verifying Status Transitions
    // ---------------------------------------------------------------
    console.log('\n--- 4. Testing Building GPS Update & Status Transitions ---');
    const updatedBld = await api.updateBuilding(bldWithoutGps.id, {
      latitude: 24.729876,
      longitude: 46.621234,
      locationSource: 'DEVICE_GPS',
      locationNote: 'Surveyed on site via technician handheld GPS'
    });

    assert(updatedBld.latitude === 24.729876, 'Updated latitude persisted');
    assert(updatedBld.longitude === 46.621234, 'Updated longitude persisted');
    assert(
      updatedBld.locationStatus === 'GPS_CONFIGURED',
      'Transitioned to GPS_CONFIGURED'
    );
    assert(
      updatedBld.locationSource === 'DEVICE_GPS',
      'LocationSource updated to DEVICE_GPS'
    );

    // ---------------------------------------------------------------
    // 5. Clearing Building GPS
    // ---------------------------------------------------------------
    console.log('\n--- 5. Testing Clearing Building GPS ---');
    const clearedBld = await api.updateBuilding(updatedBld.id, {
      latitude: null,
      longitude: null,
      locationSource: 'NONE',
      locationNote: ''
    });

    assert(clearedBld.latitude === null, 'Cleared building latitude is null');
    assert(clearedBld.longitude === null, 'Cleared building longitude is null');
    assert(
      clearedBld.locationStatus === 'LOCATION_NOT_CONFIGURED',
      'Cleared building locationStatus is LOCATION_NOT_CONFIGURED'
    );
    assert(
      clearedBld.locationSource === 'NONE',
      'Cleared building locationSource is NONE'
    );

    // ---------------------------------------------------------------
    // 6. Machine GPS Independence Guarantee (Zero Machine Mutation)
    // ---------------------------------------------------------------
    console.log('\n--- 6. Testing Machine GPS Independence Guarantee ---');
    // Ensure we have a machine in the building or create one
    const allMachines = await api.getMachines();
    const testMachine = allMachines[0];

    if (testMachine) {
      const initialMachineLat = testMachine.latitude;
      const initialMachineLng = testMachine.longitude;
      const initialMachineSource = testMachine.locationSource;
      const initialMachineStatus = testMachine.locationStatus;

      // Update building GPS to a new position
      await api.updateBuilding(bldWithGps.id, {
        latitude: 24.730000,
        longitude: 46.630000,
        locationSource: 'MANUAL_ENTRY'
      });

      // Verify the machine record was NOT mutated
      const reFetchedMachine = (await api.getMachines()).find(m => m.id === testMachine.id);
      assert(
        reFetchedMachine?.latitude === initialMachineLat,
        'Machine latitude remained unchanged after building GPS update'
      );
      assert(
        reFetchedMachine?.longitude === initialMachineLng,
        'Machine longitude remained unchanged after building GPS update'
      );
      assert(
        reFetchedMachine?.locationSource === initialMachineSource,
        'Machine locationSource remained unchanged'
      );
      assert(
        reFetchedMachine?.locationStatus === initialMachineStatus,
        'Machine locationStatus remained unchanged'
      );
    } else {
      console.log('ℹ️ No machines present in database to test machine GPS isolation (zero seed mode)');
    }

    // ---------------------------------------------------------------
    // 7. Verification Summary
    // ---------------------------------------------------------------
    console.log('\n====================================================');
    console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 Test suite encountered fatal error:', error);
    process.exit(1);
  }
}

runBuildingLocationTests();
