import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { buildPublicMachineQrUrl } from '../src/utils/qrUrlBuilder';

function runRoutingSeparationVerification() {
  console.log('================================================================');
  console.log(' VERIFY: PUBLIC / TECHNICIAN QR UI ROUTING SEPARATION');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, message: string) {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Exact URL Generation Targets
  // ---------------------------------------------------------------------------
  console.log('Test 1: Verifying Exact QR URL Target Formats...');

  const baseConfiguredUrl = 'https://example.test';
  const sampleToken = 'TOKEN';

  // Customer Target
  const customerResult = buildPublicMachineQrUrl({
    machine: { publicQrToken: sampleToken },
    configuredBaseUrl: baseConfiguredUrl,
    targetMode: 'customer'
  });
  assert(
    customerResult.url === 'https://example.test/report-fault?token=TOKEN',
    `Customer QR URL matches exact format: ${customerResult.url}`
  );
  assert(customerResult.isConfigured === true, 'Customer URL marked as configured');
  assert(customerResult.isDevFallback === false, 'Customer URL not using dev fallback');

  // Technician Target
  const techResult = buildPublicMachineQrUrl({
    machine: { publicQrToken: sampleToken },
    configuredBaseUrl: baseConfiguredUrl,
    targetMode: 'technician'
  });
  assert(
    techResult.url === 'https://example.test/technician-portal?machineToken=TOKEN',
    `Technician QR URL matches exact format: ${techResult.url}`
  );

  // Part Request Target
  const partResult = buildPublicMachineQrUrl({
    machine: { publicQrToken: sampleToken },
    configuredBaseUrl: baseConfiguredUrl,
    targetMode: 'part-request'
  });
  assert(
    partResult.url === 'https://example.test/technician-portal?machineToken=TOKEN&tab=parts',
    `Part Request QR URL matches exact format: ${partResult.url}`
  );

  // ---------------------------------------------------------------------------
  // 2. URL Encoding for Opaque Token Values
  // ---------------------------------------------------------------------------
  console.log('\nTest 2: Verifying URL Encoding for Complex Opaque Tokens...');

  const complexToken = 'QR+TOKEN&KSU=001/A B?#';
  const encodedExpected = encodeURIComponent(complexToken);

  const customerEncodedResult = buildPublicMachineQrUrl({
    machine: { publicQrToken: complexToken },
    configuredBaseUrl: baseConfiguredUrl,
    targetMode: 'customer'
  });
  assert(
    customerEncodedResult.url === `https://example.test/report-fault?token=${encodedExpected}`,
    `Customer URL properly encodes opaque token with special characters`
  );

  const techEncodedResult = buildPublicMachineQrUrl({
    machine: { publicQrToken: complexToken },
    configuredBaseUrl: baseConfiguredUrl,
    targetMode: 'technician'
  });
  assert(
    techEncodedResult.url === `https://example.test/technician-portal?machineToken=${encodedExpected}`,
    `Technician URL properly encodes opaque token with special characters`
  );

  const partEncodedResult = buildPublicMachineQrUrl({
    machine: { publicQrToken: complexToken },
    configuredBaseUrl: baseConfiguredUrl,
    targetMode: 'part-request'
  });
  assert(
    partEncodedResult.url === `https://example.test/technician-portal?machineToken=${encodedExpected}&tab=parts`,
    `Part Request URL properly encodes opaque token with special characters`
  );

  // ---------------------------------------------------------------------------
  // 3. Regression Test: Prevention of Double URL Decoding
  // ---------------------------------------------------------------------------
  console.log('\nTest 3: Regression Test - Prevention of Double URL Decoding...');

  // 3a. Token containing literal percent-encoded-looking sequence: 'ABC%2FDEF'
  const literalPercentToken = 'ABC%2FDEF';
  const qrLiteralPercent = buildPublicMachineQrUrl({
    machine: { publicQrToken: literalPercentToken },
    configuredBaseUrl: baseConfiguredUrl,
    targetMode: 'customer'
  });
  // Must be encoded to ABC%252FDEF
  assert(
    qrLiteralPercent.url === 'https://example.test/report-fault?token=ABC%252FDEF',
    `QR builder correctly encodes ABC%2FDEF to ABC%252FDEF (found: ${qrLiteralPercent.url})`
  );

  // When parsed through URLSearchParams:
  const parsedCustomerUrl = new URL(qrLiteralPercent.url!);
  const extractedToken = parsedCustomerUrl.searchParams.get('token');
  assert(
    extractedToken === 'ABC%2FDEF',
    `URLSearchParams.get('token') returns exact raw token 'ABC%2FDEF' (found: ${extractedToken})`
  );
  assert(
    extractedToken !== 'ABC/DEF',
    `CRITICAL: Token was NOT double-decoded into 'ABC/DEF'`
  );

  // 3b. Token containing: +, &, =, %, spaces, and slashes
  const mixedComplexToken = 'TOKEN+PLUS&AMP=EQUAL%PCT SPACE/SLASH';
  const qrMixedTech = buildPublicMachineQrUrl({
    machine: { publicQrToken: mixedComplexToken },
    configuredBaseUrl: baseConfiguredUrl,
    targetMode: 'technician'
  });
  const parsedTechUrl = new URL(qrMixedTech.url!);
  const extractedTechToken = parsedTechUrl.searchParams.get('machineToken');
  assert(
    extractedTechToken === mixedComplexToken,
    `Technician URLSearchParams parses mixed special characters (+ & = % spaces /) with exact fidelity`
  );

  // 3c. Part Request with special characters
  const qrMixedPart = buildPublicMachineQrUrl({
    machine: { publicQrToken: mixedComplexToken },
    configuredBaseUrl: baseConfiguredUrl,
    targetMode: 'part-request'
  });
  const parsedPartUrl = new URL(qrMixedPart.url!);
  const extractedPartToken = parsedPartUrl.searchParams.get('machineToken');
  const extractedPartTab = parsedPartUrl.searchParams.get('tab');
  assert(
    extractedPartToken === mixedComplexToken && extractedPartTab === 'parts',
    `Part Request URLSearchParams parses machineToken and tab=parts with exact fidelity`
  );

  // 3d. Audit: Ensure App.tsx and TechnicianMobilePortal.tsx do NOT call decodeURIComponent on URLSearchParams
  const appSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  assert(
    !appSrc.includes('decodeURIComponent(machineParam)'),
    'App.tsx does NOT call decodeURIComponent on machineParam from URLSearchParams'
  );

  const techPortalSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/views/TechnicianMobilePortal.tsx'),
    'utf8'
  );
  assert(
    !techPortalSrc.includes('decodeURIComponent(tokenParam)') && !techPortalSrc.includes('decodeURIComponent(hashToken)'),
    'TechnicianMobilePortal does NOT call decodeURIComponent on tokenParam or hashToken from URLSearchParams'
  );

  // ---------------------------------------------------------------------------
  // 4. Fail-Closed Behavior When PUBLIC_QR_BASE_URL is Missing
  // ---------------------------------------------------------------------------
  console.log('\nTest 4: Verifying Fail-Closed Production Behavior When Base URL is Missing...');

  const missingBaseProdResult = buildPublicMachineQrUrl({
    machine: { publicQrToken: sampleToken },
    configuredBaseUrl: '',
    allowDevFallback: false
  });
  assert(missingBaseProdResult.url === null, 'Production URL is strictly null when base URL is missing');
  assert(
    missingBaseProdResult.errorCode === 'PUBLIC_QR_BASE_URL_NOT_CONFIGURED',
    `Returns expected errorCode: ${missingBaseProdResult.errorCode}`
  );
  assert(missingBaseProdResult.isConfigured === false, 'isConfigured is false');
  assert(missingBaseProdResult.isDevFallback === false, 'isDevFallback is false in production mode');

  // Missing token fail-closed check
  const missingTokenResult = buildPublicMachineQrUrl({
    machine: {},
    configuredBaseUrl: baseConfiguredUrl
  });
  assert(missingTokenResult.url === null, 'URL is strictly null when token is missing');
  assert(
    missingTokenResult.errorCode === 'MACHINE_QR_TOKEN_MISSING',
    `Returns expected errorCode: ${missingTokenResult.errorCode}`
  );

  // ---------------------------------------------------------------------------
  // 5. Source Audit: No Colliding QR Destination Generation
  // ---------------------------------------------------------------------------
  console.log('\nTest 5: Source Audit - No Remaining Conflicting QR Destinations...');

  const qrBuilderSource = fs.readFileSync(path.resolve(process.cwd(), 'src/utils/qrUrlBuilder.ts'), 'utf8');

  // Ensure old UI generation patterns are eliminated
  assert(
    !qrBuilderSource.includes("`${devBaseUrl}/public/m/`") && !qrBuilderSource.includes("`${baseUrl}/public/m/`"),
    'qrUrlBuilder does not generate old `/public/m/` UI URLs'
  );
  assert(
    !qrBuilderSource.includes("`${devBaseUrl}/technician?`") && !qrBuilderSource.includes("`${baseUrl}/technician?`"),
    'qrUrlBuilder does not generate old `/technician?machineToken=` UI URLs'
  );

  // Ensure new UI generation patterns are present
  assert(
    qrBuilderSource.includes('/report-fault?token='),
    'qrUrlBuilder contains `/report-fault?token=` UI route'
  );
  assert(
    qrBuilderSource.includes('/technician-portal?machineToken='),
    'qrUrlBuilder contains `/technician-portal?machineToken=` UI route'
  );

  // ---------------------------------------------------------------------------
  // 6. App.tsx Routing Separation Audit
  // ---------------------------------------------------------------------------
  console.log('\nTest 6: App.tsx Routing Separation Audit...');

  const appSource = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');

  // Verify /technician-portal is explicitly checked
  assert(
    appSource.includes("pathname === '/technician-portal'") || appSource.includes("isTechnicianPortal"),
    'App.tsx has explicit check for /technician-portal'
  );

  // Verify that bare '/technician' substring is not intercepted as the technician UI route
  assert(
    !appSource.includes("pathname.includes('/technician')"),
    'App.tsx removed broad `pathname.includes(\'/technician\')` match to avoid intercepting API proxy namespace'
  );

  // Verify server.ts retains cloudProxy mappings
  const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
  assert(
    serverSource.includes("app.use('/public', cloudProxy);"),
    'server.ts preserves app.use(\'/public\', cloudProxy)'
  );
  assert(
    serverSource.includes("app.use('/technician', cloudProxy);"),
    'server.ts preserves app.use(\'/technician\', cloudProxy)'
  );

  // ---------------------------------------------------------------------------
  // 7. TechnicianMobilePortal Safety Audit (No Auto-Auth, No Auto-Write)
  // ---------------------------------------------------------------------------
  console.log('\nTest 7: TechnicianMobilePortal Safety Audit...');

  const techPortalSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/views/TechnicianMobilePortal.tsx'),
    'utf8'
  );

  assert(
    techPortalSource.includes("params.get('machineToken')"),
    'TechnicianMobilePortal reads `machineToken` from URL query parameters'
  );
  assert(
    techPortalSource.includes("params.get('tab')"),
    'TechnicianMobilePortal reads `tab` from URL query parameters'
  );
  assert(
    techPortalSource.includes('requestedTabIntent'),
    'TechnicianMobilePortal preserves requested tab intent safely in state'
  );

  // Verify authentication guard is NOT bypassed
  assert(
    techPortalSource.includes('if (!token) {') && techPortalSource.includes('handleLogin'),
    'TechnicianMobilePortal enforces login guard when unauthenticated'
  );

  // Verify checkin is NOT executed automatically on mount
  assert(
    !techPortalSource.match(/useEffect\s*\(\s*\(\)\s*=>\s*\{[^}]*handleCheckin\s*\(/s),
    'TechnicianMobilePortal does NOT call handleCheckin inside any useEffect'
  );

  // Verify part request is NOT executed automatically on mount
  assert(
    !techPortalSource.match(/useEffect\s*\(\s*\(\)\s*=>\s*\{[^}]*handleRequestSparePart\s*\(/s),
    'TechnicianMobilePortal does NOT call handleRequestSparePart inside any useEffect'
  );

  // ---------------------------------------------------------------------------
  // 8. Baseline Fleet Integrity Audit (Zero Modifications)
  // ---------------------------------------------------------------------------
  console.log('\nTest 8: Auditing Protected Baseline Fleet Integrity...');

  const fleetPath = path.resolve(process.cwd(), 'fleet_data.json');
  const fleetDataRaw = fs.readFileSync(fleetPath, 'utf8');
  const fleetData = JSON.parse(fleetDataRaw);
  const currentHash = crypto.createHash('sha256').update(fleetDataRaw).digest('hex');

  const expectedHash = 'cfb83460aa1aa2acac6d68c07cacc9168fa3583b8aa880bd875092f2fd992478';
  assert(currentHash === expectedHash, `fleet_data.json SHA256 matches baseline perfectly: ${currentHash}`);

  const machines = Array.isArray(fleetData) ? fleetData : fleetData.machines;
  assert(machines.length === 189, `Fleet machine count remains exactly 189 (found: ${machines.length})`);

  console.log('\n================================================================');
  console.log(` ALL TESTS PASSED: ${passed} / ${total} assertions verified!`);
  console.log('================================================================\n');
}

runRoutingSeparationVerification();
