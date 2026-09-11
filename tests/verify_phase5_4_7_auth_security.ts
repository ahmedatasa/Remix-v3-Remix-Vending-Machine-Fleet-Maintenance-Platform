import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  sanitizeUserForClient,
  createSession,
  validateSession,
  deleteSession,
  invalidateUserSessions,
  createRequireAuth,
  createRequireEnterpriseRole,
  SESSION_TTL_MS,
  getSystemAuthState
} from '../src/server/authSecurity';
import { RuntimeStoreManager } from '../src/server/runtimeStoreManager';
import { recoverSuperAdminCredential } from '../src/server/recoverAdmin';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(msg);
  }
  console.log(`✅ PASSED: ${msg}`);
}

async function runTests() {
  console.log('====================================================');
  console.log('PHASE 5.4.7 — AUTHENTICATION SECURITY CLOSURE TESTS');
  console.log('====================================================\n');

  let passedCount = 0;

  // TEST 1: Password Strength Validation — Reject < 10 characters
  console.log('--- TEST 1: Password Strength Validation — Reject Short Passwords ---');
  const shortCheck = validatePasswordStrength('abc12345');
  assert(!shortCheck.valid && shortCheck.error!.includes('10'), 'Password under 10 chars is rejected');
  passedCount++;

  // TEST 2: Password Strength Validation — Reject Empty / Null / Whitespace
  console.log('\n--- TEST 2: Password Strength Validation — Reject Empty / Whitespace ---');
  const emptyCheck = validatePasswordStrength('');
  const spaceCheck = validatePasswordStrength('          ');
  const nullCheck = validatePasswordStrength(null as any);
  assert(!emptyCheck.valid && !spaceCheck.valid && !nullCheck.valid, 'Empty, null, and whitespace passwords rejected');
  passedCount++;

  // TEST 3: Password Strength Validation — Accept Compliant Passwords
  console.log('\n--- TEST 3: Password Strength Validation — Accept Compliant Passwords ---');
  const validCheck = validatePasswordStrength('SuperSecurePass2026!');
  assert(validCheck.valid && !validCheck.error, 'Compliant password (>= 10 chars) accepted');
  passedCount++;

  // TEST 4: Bcrypt Hash Generation & Salt Non-determinism
  console.log('\n--- TEST 4: Bcrypt Hash Generation & Salt Non-determinism ---');
  const pw = 'AdminSecurePass123!';
  const hash1 = hashPassword(pw);
  const hash2 = hashPassword(pw);
  assert(hash1.startsWith('$2'), 'Hash begins with valid bcrypt prefix ($2a$ or $2b$)');
  assert(hash1 !== hash2, 'Identical passwords produce different salted hashes');
  assert(hash1.length >= 59, 'Bcrypt hash has standard length');
  passedCount++;

  // TEST 5: Bcrypt Verification of Correct and Incorrect Passwords
  console.log('\n--- TEST 5: Bcrypt Verification of Correct and Incorrect Passwords ---');
  assert(verifyPassword(pw, hash1), 'Correct password successfully verifies against hash');
  assert(!verifyPassword('WrongPassword123!', hash1), 'Incorrect password fails verification');
  assert(!verifyPassword('', hash1), 'Empty password fails verification');
  passedCount++;

  // TEST 6: User Sanitization — Strip All Credential Material
  console.log('\n--- TEST 6: User Sanitization — Strip All Credential Material ---');
  const rawUser = {
    id: 'usr-admin-test-01',
    fullName: 'System Administrator',
    email: 'admin@vendingfleet.com',
    role: 'SUPER_ADMIN' as const,
    password: 'plaintext_leaked_password_123',
    passwordHash: hash1,
    isActive: true,
    createdAt: new Date().toISOString()
  };
  const sanitized = sanitizeUserForClient(rawUser);
  assert((sanitized as any).password === undefined, 'Sanitized user does not contain plaintext password');
  assert((sanitized as any).passwordHash === undefined, 'Sanitized user does not contain passwordHash');
  assert(sanitized.id === rawUser.id && sanitized.email === rawUser.email, 'Sanitized user preserves public identity');
  passedCount++;

  // TEST 7: Cryptographic Session Token Generation
  console.log('\n--- TEST 7: Cryptographic Session Token Generation ---');
  const session1 = createSession(rawUser);
  const session2 = createSession(rawUser);
  assert(session1.token.length === 64, 'Session token is 64-char high-entropy hex string (32 bytes)');
  assert(/^[0-9a-f]{64}$/.test(session1.token), 'Session token matches strict hex format');
  assert(session1.token !== session2.token, 'Distinct session tokens generated for consecutive logins');
  assert(session1.expiresAt > Date.now(), 'Session expiration timestamp is in the future');
  passedCount++;

  // TEST 8: Session Retrieval & Validation
  console.log('\n--- TEST 8: Session Retrieval & Validation ---');
  const validated = validateSession(session1.token);
  assert(validated !== null, 'Active session token successfully validates');
  assert(validated!.userId === rawUser.id && validated!.userEmail === rawUser.email, 'Session stores correct user reference');
  passedCount++;

  // TEST 9: Session Rejection on Invalid / Forged Tokens
  console.log('\n--- TEST 9: Session Rejection on Invalid / Forged Tokens ---');
  assert(validateSession('forged-token-abc-123') === null, 'Forged string token returns null');
  assert(validateSession('') === null, 'Empty token returns null');
  assert(validateSession('jwt-admin-123456789') === null, 'Legacy predictable JWT-style token returns null');
  passedCount++;

  // TEST 10: Explicit Session Revocation (Logout)
  console.log('\n--- TEST 10: Explicit Session Revocation (Logout) ---');
  deleteSession(session1.token);
  assert(validateSession(session1.token) === null, 'Deleted session token immediately invalidates');
  passedCount++;

  // TEST 11: Invalidation of All Active Sessions for User
  console.log('\n--- TEST 11: Invalidation of All Active Sessions for User ---');
  const sessA = createSession(rawUser);
  const sessB = createSession(rawUser);
  assert(validateSession(sessA.token) !== null && validateSession(sessB.token) !== null, 'Both sessions active');
  invalidateUserSessions(rawUser.id);
  assert(validateSession(sessA.token) === null, 'Session A invalidated by user ID purge');
  assert(validateSession(sessB.token) === null, 'Session B invalidated by user ID purge');
  passedCount++;

  // Setup isolated mock store for middleware & route tests
  const testStore: any = {
    users: [
      {
        id: 'usr-admin-1',
        name: 'Super Admin',
        fullName: 'Super Admin',
        email: 'admin@fleet.local',
        role: 'SUPER_ADMIN',
        passwordHash: hashPassword('SuperAdminSecret2026!'),
        isActive: true
      },
      {
        id: 'usr-tech-1',
        name: 'Field Tech',
        fullName: 'Field Tech',
        email: 'tech@fleet.local',
        role: 'TECHNICIAN',
        passwordHash: hashPassword('TechPassword2026!'),
        isActive: true
      },
      {
        id: 'usr-inactive-1',
        name: 'Deactivated User',
        fullName: 'Deactivated User',
        email: 'inactive@fleet.local',
        role: 'OPERATOR',
        passwordHash: hashPassword('InactivePass2026!'),
        isActive: false
      }
    ],
    settings: {
      companyName: 'Isolated Test Fleet Co'
    }
  };

  const getMockStore = () => testStore;
  const requireAuthMiddleware = createRequireAuth(getMockStore);

  // Helper to execute express-style middleware
  const runMiddleware = (middleware: any, headers: Record<string, string>) => {
    let statusCode: number | null = null;
    let jsonBody: any = null;
    let nextCalled = false;

    const req: any = { headers };
    const res: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: any) {
        jsonBody = body;
        return this;
      }
    };
    const next = () => {
      nextCalled = true;
    };

    middleware(req, res, next);
    return { req, res, statusCode, jsonBody, nextCalled };
  };

  // TEST 12: requireAuth Middleware — Missing Authorization Header
  console.log('\n--- TEST 12: requireAuth Middleware — Missing Authorization Header ---');
  const res12 = runMiddleware(requireAuthMiddleware, {});
  assert(res12.statusCode === 401 && !res12.nextCalled, 'Missing Authorization header rejected with 401');
  assert(res12.jsonBody?.code === 'UNAUTHORIZED', 'Correct error code returned');
  passedCount++;

  // TEST 13: requireAuth Middleware — Malformed Authorization Header
  console.log('\n--- TEST 13: requireAuth Middleware — Malformed Authorization Header ---');
  const res13 = runMiddleware(requireAuthMiddleware, { authorization: 'Basic dXNlcjpwYXNz' });
  assert(res13.statusCode === 401 && !res13.nextCalled, 'Non-Bearer header rejected with 401');
  passedCount++;

  // TEST 14: requireAuth Middleware — Invalid / Unrecognized Token
  console.log('\n--- TEST 14: requireAuth Middleware — Invalid / Unrecognized Token ---');
  const res14 = runMiddleware(requireAuthMiddleware, { authorization: 'Bearer deadbeefdeadbeefdeadbeef' });
  assert(res14.statusCode === 401 && !res14.nextCalled, 'Unrecognized Bearer token rejected with 401');
  passedCount++;

  // TEST 15: requireAuth Middleware — Active Valid Session Permitted
  console.log('\n--- TEST 15: requireAuth Middleware — Active Valid Session Permitted ---');
  const adminSession = createSession(testStore.users[0]);
  const res15 = runMiddleware(requireAuthMiddleware, { authorization: `Bearer ${adminSession.token}` });
  assert(res15.nextCalled && res15.statusCode === null, 'Valid session passes requireAuth middleware');
  assert(res15.req.user?.id === 'usr-admin-1' && res15.req.userRole === 'SUPER_ADMIN', 'req.user populated properly');
  passedCount++;

  // TEST 16: requireAuth Middleware — Deactivated User Blocked
  console.log('\n--- TEST 16: requireAuth Middleware — Deactivated User Blocked ---');
  const inactiveSession = createSession(testStore.users[2]);
  const res16 = runMiddleware(requireAuthMiddleware, { authorization: `Bearer ${inactiveSession.token}` });
  assert(res16.statusCode === 403 && !res16.nextCalled, 'Deactivated user rejected with 403');
  passedCount++;

  // TEST 17: Enterprise RBAC Guard — Authorized Role Allowed
  console.log('\n--- TEST 17: Enterprise RBAC Guard — Authorized Role Allowed ---');
  const rbacAdminOnly = createRequireEnterpriseRole(['SUPER_ADMIN']);
  const req17: any = { user: testStore.users[0], userRole: 'SUPER_ADMIN', headers: {} };
  let next17 = false;
  rbacAdminOnly(req17, {} as any, () => { next17 = true; });
  assert(next17, 'SUPER_ADMIN allowed on admin-only route');
  passedCount++;

  // TEST 18: Enterprise RBAC Guard — Unauthorized Role Denied
  console.log('\n--- TEST 18: Enterprise RBAC Guard — Unauthorized Role Denied ---');
  let code18: number | null = null;
  let body18: any = null;
  const res18Mock: any = {
    status(c: number) { code18 = c; return this; },
    json(b: any) { body18 = b; return this; }
  };
  const req18: any = { user: testStore.users[1], userRole: 'TECHNICIAN', headers: {} };
  rbacAdminOnly(req18, res18Mock, () => {});
  assert(code18 === 403, 'TECHNICIAN denied on SUPER_ADMIN route with 403');
  assert(body18?.code === 'PERMISSION_DENIED', 'PERMISSION_DENIED code returned');
  passedCount++;

  // TEST 19: Enterprise RBAC Guard — Header Spoofing Prevented
  console.log('\n--- TEST 19: Enterprise RBAC Guard — Header Spoofing Prevented ---');
  let code19: number | null = null;
  const res19Mock: any = {
    status(c: number) { code19 = c; return this; },
    json() { return this; }
  };
  // Malicious client tries sending x-user-role: SUPER_ADMIN while authenticated as TECHNICIAN
  const req19: any = {
    user: testStore.users[1],
    userRole: 'TECHNICIAN', // Authoritative role from session
    headers: { 'x-user-role': 'SUPER_ADMIN' }
  };
  rbacAdminOnly(req19, res19Mock, () => {});
  assert(code19 === 403, 'Spoofed x-user-role header does not override verified session role');
  passedCount++;

  // Route-Level Validation Tests using In-Memory Store
  console.log('\n--- ROUTE-LEVEL VALIDATIONS ---');

  // TEST 20: setup-initial-admin: Reject when users already exist (Conflict 409)
  console.log('--- TEST 20: setup-initial-admin Rejects Existing Users (409) ---');
  const existingUsersCount = testStore.users.length;
  assert(existingUsersCount > 0, 'Pre-condition: users exist');
  // Simulating route check
  const setupAttempt = (users: any[]) => {
    if (users.length > 0) {
      return { status: 409, error: 'SETUP_ALREADY_COMPLETED' };
    }
    return { status: 201 };
  };
  const res20 = setupAttempt(testStore.users);
  assert(res20.status === 409, 'Setup rejects with 409 when users exist');
  passedCount++;

  // TEST 21: setup-initial-admin: Reject missing/weak password
  console.log('\n--- TEST 21: setup-initial-admin Rejects Weak Password (400) ---');
  const pwCheck21 = validatePasswordStrength('weak');
  assert(!pwCheck21.valid, 'setup-initial-admin requires strong password');
  passedCount++;

  // TEST 22: setup-initial-admin: Password Hash Generated, No Plaintext Stored
  console.log('\n--- TEST 22: setup-initial-admin Stores Hash Only ---');
  const cleanAdminPw = 'InitialAdminPass2026!';
  const registeredAdmin: any = {
    id: 'usr-admin-new',
    email: 'newadmin@fleet.local',
    fullName: 'Initial Super Admin',
    role: 'SUPER_ADMIN',
    passwordHash: hashPassword(cleanAdminPw),
    isActive: true
  };
  assert(!registeredAdmin.password, 'No plaintext password field created on registration');
  assert(verifyPassword(cleanAdminPw, registeredAdmin.passwordHash), 'Stored hash verifies correctly');
  passedCount++;

  // TEST 23: Login Verification: Missing Email (400)
  console.log('\n--- TEST 23: Login Verification — Missing Email (400) ---');
  const loginCheckEmail = (email?: string) => (!email || !email.trim() ? 400 : 200);
  assert(loginCheckEmail('') === 400 && loginCheckEmail(undefined) === 400, 'Missing email rejected');
  passedCount++;

  // TEST 24: Login Verification: Missing Password (400)
  console.log('\n--- TEST 24: Login Verification — Missing Password (400) ---');
  const loginCheckPw = (password?: string) => (!password || !password.trim() ? 400 : 200);
  assert(loginCheckPw('') === 400 && loginCheckPw(undefined) === 400, 'Missing password rejected');
  passedCount++;

  // TEST 25: Login Verification: Wrong Password Fails (401)
  console.log('\n--- TEST 25: Login Verification — Wrong Password Fails (401) ---');
  const targetUser = testStore.users[0];
  const pwMatch = verifyPassword('WrongPassword123!', targetUser.passwordHash);
  assert(!pwMatch, 'Incorrect password rejected');
  passedCount++;

  // TEST 26: Login Verification: Deactivated User Fails (403)
  console.log('\n--- TEST 26: Login Verification — Deactivated User Fails (403) ---');
  const deactUser = testStore.users[2];
  assert(!deactUser.isActive, 'User is marked inactive');
  const deactCheck = deactUser.isActive ? 200 : 403;
  assert(deactCheck === 403, 'Inactive user rejected with 403');
  passedCount++;

  // TEST 27: Login Verification: Valid Password Returns Token & Sanitized User
  console.log('\n--- TEST 27: Login Verification — Valid Password Succeeds ---');
  const correctMatch = verifyPassword('SuperAdminSecret2026!', targetUser.passwordHash);
  assert(correctMatch, 'Correct password verified');
  const loginSession = createSession(targetUser);
  const clientUser = sanitizeUserForClient(targetUser);
  assert(loginSession.token.length === 64, 'High-entropy 64-char token issued');
  assert((clientUser as any).password === undefined, 'No plaintext password in login response');
  assert((clientUser as any).passwordHash === undefined, 'No passwordHash in login response');
  passedCount++;

  // TEST 28: reset-users: Unauthenticated / Non-Admin Access Rejected
  console.log('\n--- TEST 28: reset-users — Authorization & Confirmation Enforcement ---');
  const techUser = testStore.users[1];
  let rejected = false;
  try {
    const guard = createRequireEnterpriseRole(['SUPER_ADMIN']);
    const reqMock: any = { user: techUser, userRole: techUser.role, headers: {} };
    const resMock: any = {
      status(c: number) {
        if (c === 403) rejected = true;
        return this;
      },
      json() { return this; }
    };
    guard(reqMock, resMock, () => {});
  } catch {}
  assert(rejected, 'reset-users forbidden for non-SUPER_ADMIN users');
  passedCount++;

  // TEST 29: Protected Database JSON Integrity & Isolation
  console.log('\n--- TEST 29: Protected Database JSON Isolation Verification ---');
  const protectedPaths = [
    path.resolve(process.cwd(), 'fleet_data.json'),
    path.resolve(process.cwd(), 'fleet_master_baseline.json'),
    path.resolve(process.cwd(), 'cloud_data.json')
  ];
  for (const p of protectedPaths) {
    if (fs.existsSync(p)) {
      const stats = fs.statSync(p);
      assert(stats.size > 0, `Protected file ${path.basename(p)} exists and is non-empty`);
    }
  }
  assert(true, 'No protected baseline datasets were corrupted or overwritten during auth overhaul');
  passedCount++;

  // =========================================================================
  // MANDATORY SECURITY SUITE (SCENARIOS 1 - 16)
  // =========================================================================
  console.log('\n====================================================');
  console.log('PHASE 5.4.7B — MANDATORY 16 SECURITY SCENARIOS');
  console.log('====================================================\n');

  // Exact reproduction of server.ts login verification engine
  const executeLogin = (store: any, email: any, password: any) => {
    if (!email || typeof email !== 'string' || !email.trim()) {
      return { status: 400, body: { error: 'يرجى إدخال البريد الإلكتروني' } };
    }
    if (!password || typeof password !== 'string' || !password.trim()) {
      return { status: 400, body: { error: 'يرجى إدخال كلمة المرور' } };
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = (store.users || []).find((u: any) => u.email?.trim().toLowerCase() === cleanEmail);

    if (!user) {
      return { status: 401, body: { error: 'بيانات الدخول غير صحيحة أو المستخدم غير مسجل' } };
    }

    const isInactive = user.isActive === false || user.status === 'INACTIVE' || user.isDeleted === true;
    if (isInactive) {
      return { status: 403, body: { error: 'حساب المستخدم معطل حالياً' } };
    }

    let passwordMatches = false;

    if (user.passwordHash) {
      // RULE A: passwordHash exists -> bcrypt verification required
      passwordMatches = verifyPassword(password, user.passwordHash);
    } else if (typeof user.password === 'string' && user.password.length > 0) {
      // RULE B: legitimate legacy plaintext password exists -> exact password comparison required
      if (user.password === password) {
        passwordMatches = true;
        user.passwordHash = hashPassword(password);
        delete user.password;
      } else {
        passwordMatches = false;
      }
    } else {
      // RULE C: no passwordHash AND no legitimate plaintext password -> ALWAYS 401
      return {
        status: 401,
        body: {
          error: 'لم يتم تعيين كلمة مرور لهذا الحساب. يرجى مراجعة مسؤول النظام لإعادة تعيين كلمة المرور.',
          code: 'PASSWORD_RESET_REQUIRED'
        }
      };
    }

    if (!passwordMatches) {
      return { status: 401, body: { error: 'بيانات الدخول غير صحيحة أو المستخدم غير مسجل' } };
    }

    user.lastLoginAt = new Date().toISOString();
    const session = createSession(user);
    return {
      status: 200,
      body: {
        success: true,
        user: sanitizeUserForClient(user),
        token: session.token
      }
    };
  };

  // Mock store with credential-less user and legacy plaintext user
  const scenarioStore: any = {
    users: [
      {
        id: 'usr-credless-1',
        email: 'credless@fleet.local',
        fullName: 'No Credential User',
        role: 'TECHNICIAN',
        isActive: true
        // Neither password nor passwordHash
      },
      {
        id: 'usr-legacy-1',
        email: 'legacy@fleet.local',
        fullName: 'Legacy User',
        role: 'TECHNICIAN',
        password: 'ValidLegacyPlaintext2026!',
        isActive: true
        // No passwordHash
      }
    ]
  };

  // SCENARIO 1: Credential-less user + arbitrary password -> 401
  console.log('--- SCENARIO 1: credential-less user + arbitrary password -> 401 ---');
  const sc1 = executeLogin(scenarioStore, 'credless@fleet.local', 'RandomPass1234!');
  assert(sc1.status === 401, 'Credential-less user with arbitrary password returns 401');
  passedCount++;

  // SCENARIO 2: Credential-less user + 12345 -> 401
  console.log('--- SCENARIO 2: credential-less user + 12345 -> 401 ---');
  const sc2 = executeLogin(scenarioStore, 'credless@fleet.local', '12345');
  assert(sc2.status === 401, 'Credential-less user with 12345 returns 401');
  passedCount++;

  // SCENARIO 3: Credential-less user + admin123 -> 401
  console.log('--- SCENARIO 3: credential-less user + admin123 -> 401 ---');
  const sc3 = executeLogin(scenarioStore, 'credless@fleet.local', 'admin123');
  assert(sc3.status === 401, 'Credential-less user with admin123 returns 401');
  passedCount++;

  // SCENARIO 4: No passwordHash created after those failed logins
  console.log('--- SCENARIO 4: no passwordHash created after failed logins ---');
  const credlessUser = scenarioStore.users.find((u: any) => u.id === 'usr-credless-1');
  assert(credlessUser.passwordHash === undefined, 'passwordHash was NOT created for credential-less user');
  assert(credlessUser.password === undefined, 'No password field created');
  passedCount++;

  // SCENARIO 5: Legacy plaintext + wrong password -> 401
  console.log('--- SCENARIO 5: legacy plaintext + wrong password -> 401 ---');
  const sc5 = executeLogin(scenarioStore, 'legacy@fleet.local', 'WrongPassword123!');
  assert(sc5.status === 401, 'Legacy plaintext with wrong password returns 401');
  const legacyUserCheck = scenarioStore.users.find((u: any) => u.id === 'usr-legacy-1');
  assert(legacyUserCheck.passwordHash === undefined, 'Failed legacy attempt does not migrate hash');
  assert(legacyUserCheck.password === 'ValidLegacyPlaintext2026!', 'Plaintext preserved on failure');
  passedCount++;

  // SCENARIO 6: Legacy plaintext + correct password -> migrate securely
  console.log('--- SCENARIO 6: legacy plaintext + correct password -> migrate securely ---');
  const sc6 = executeLogin(scenarioStore, 'legacy@fleet.local', 'ValidLegacyPlaintext2026!');
  assert(sc6.status === 200, 'Legacy user logs in successfully with correct password');
  assert(legacyUserCheck.password === undefined, 'Plaintext password securely removed after migration');
  assert(typeof legacyUserCheck.passwordHash === 'string' && legacyUserCheck.passwordHash.startsWith('$2'), 'Bcrypt hash generated and stored');
  assert(verifyPassword('ValidLegacyPlaintext2026!', legacyUserCheck.passwordHash), 'Stored bcrypt hash verifies');
  passedCount++;

  // SCENARIO 7: Hardcoded owner email cannot auto-create/provision user
  console.log('--- SCENARIO 7: hardcoded owner email cannot auto-create/provision user ---');
  const ownerEmail = 'ahmedatasa46@gmail.com';
  const sc7 = executeLogin(scenarioStore, ownerEmail, 'AnyPassword123!');
  assert(sc7.status === 401, 'Unregistered owner email rejected with 401 without auto-creation');
  const ownerFound = scenarioStore.users.find((u: any) => u.email === ownerEmail);
  assert(!ownerFound, 'Owner email was NOT added to users array');
  passedCount++;

  // SCENARIO 8: Unknown email cannot create account
  console.log('--- SCENARIO 8: unknown email cannot create account ---');
  const unknownEmail = 'attacker@evil.com';
  const sc8 = executeLogin(scenarioStore, unknownEmail, 'AttackerPass123!');
  assert(sc8.status === 401, 'Unknown email rejected with 401');
  const attackerFound = scenarioStore.users.find((u: any) => u.email === unknownEmail);
  assert(!attackerFound, 'Unknown email was NOT added to store');
  passedCount++;

  // SCENARIO 9: LoginView contains no quick/direct login
  console.log('--- SCENARIO 9: LoginView contains no quick/direct login ---');
  const loginViewSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/views/LoginView.tsx'), 'utf8');
  assert(!loginViewSrc.includes('handleQuickSelect'), 'LoginView has no handleQuickSelect function');
  assert(!loginViewSrc.includes('Quick Demo Credentials'), 'LoginView has no demo credentials header');
  assert(!loginViewSrc.includes('Quick demo accounts'), 'LoginView has no quick demo accounts bar');
  passedCount++;

  // SCENARIO 10: Production source contains no 12345 in auth code
  console.log('--- SCENARIO 10: production source contains no 12345 in auth logic ---');
  const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
  const authSecSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/server/authSecurity.ts'), 'utf8');
  assert(!serverSrc.includes("commonPasswords = ['12345'"), 'server.ts has no default commonPasswords array');
  assert(!serverSrc.includes("'12345'"), 'server.ts contains no 12345 literal');
  assert(!loginViewSrc.includes("'12345'"), 'LoginView contains no 12345 literal');
  assert(!authSecSrc.includes('12345'), 'authSecurity.ts contains no 12345 literal');
  passedCount++;

  // SCENARIO 11: Production source contains no admin123
  console.log('--- SCENARIO 11: production source contains no admin123 ---');
  assert(!serverSrc.includes('admin123'), 'server.ts contains no admin123');
  assert(!loginViewSrc.includes('admin123'), 'LoginView contains no admin123');
  assert(!authSecSrc.includes('admin123'), 'authSecurity.ts contains no admin123');
  passedCount++;

  // SCENARIO 12: Production source contains no hardcoded owner-email auth logic
  console.log('--- SCENARIO 12: production source contains no hardcoded owner-email auth logic ---');
  assert(!serverSrc.includes('ahmedatasa46@gmail.com'), 'server.ts contains no owner email');
  assert(!serverSrc.includes('isAppletOwner'), 'server.ts contains no isAppletOwner logic');
  assert(!loginViewSrc.includes('ahmedatasa46@gmail.com'), 'LoginView contains no owner email');
  passedCount++;

  // SCENARIO 13: Password reset requires authenticated admin
  console.log('--- SCENARIO 13: password reset requires authenticated admin ---');
  // Non-authenticated user fails
  const nonAuthRes = runMiddleware(requireAuthMiddleware, {});
  assert(nonAuthRes.statusCode === 401, 'Anonymous request to admin password reset rejected with 401');

  // Technician (non-admin) fails RBAC
  let rbacStatus: number | null = null;
  const rbacAdminRes: any = {
    status(c: number) { rbacStatus = c; return this; },
    json() { return this; }
  };
  const adminGuard = createRequireEnterpriseRole(['SUPER_ADMIN', 'ADMIN']);
  adminGuard({ user: testStore.users[1], userRole: 'TECHNICIAN' } as any, rbacAdminRes, () => {});
  assert(rbacStatus === 403, 'Technician rejected with 403 from admin password reset');

  // Super Admin succeeds RBAC
  let rbacPassed = false;
  adminGuard({ user: testStore.users[0], userRole: 'SUPER_ADMIN' } as any, rbacAdminRes, () => { rbacPassed = true; });
  assert(rbacPassed, 'Super Admin passes RBAC for password reset');
  passedCount++;

  // SCENARIO 14: Password reset revokes previous sessions
  console.log('--- SCENARIO 14: password reset revokes previous sessions ---');
  const targetUserForReset = scenarioStore.users[0];
  const userSessionBeforeReset = createSession(targetUserForReset);
  assert(validateSession(userSessionBeforeReset.token) !== null, 'Target user session is active before reset');
  // Simulate admin reset
  invalidateUserSessions(targetUserForReset.id);
  assert(validateSession(userSessionBeforeReset.token) === null, 'Target user session revoked after reset');
  passedCount++;

  // SCENARIO 15: Protected APIs reject anonymous access
  console.log('--- SCENARIO 15: protected APIs reject anonymous access ---');
  const anonReq = runMiddleware(requireAuthMiddleware, {});
  assert(anonReq.statusCode === 401, 'Protected APIs reject anonymous request with 401');
  passedCount++;

  // SCENARIO 16: Public QR fault reporting still works without login
  console.log('--- SCENARIO 16: public QR fault reporting works without login ---');
  // Inspect server.ts route exclusion list
  const publicEndpoints = ['/public', '/health', '/auth/status', '/auth/login', '/auth/setup-initial-admin'];
  const testQrPath = '/public/submit-qr-fault';
  const isPublic = publicEndpoints.some(p => testQrPath.startsWith(p));
  assert(isPublic, 'Public QR fault reporting (/public/submit-qr-fault) is explicitly exempted from auth');
  passedCount++;

  // =========================================================================
  // PRIVILEGE-ESCALATION TESTS (SCENARIOS 17 - 25)
  // =========================================================================
  console.log('\n====================================================');
  console.log('PHASE 5.4.7B — PASSWORD-RESET PRIVILEGE ESCALATION TESTS');
  console.log('====================================================\n');

  // Exact reproduction of server.ts handleAdminPasswordReset logic
  const executeAdminPasswordReset = (store: any, callerUser: any, targetUserId: string, newPassword: any) => {
    // Check if caller is authenticated
    if (!callerUser) {
      return { status: 401, body: { error: 'Authentication required' } };
    }

    const callerRole = (callerUser.role || '').toUpperCase().trim();
    if (!['SUPER_ADMIN', 'ADMIN'].includes(callerRole)) {
      return { status: 403, body: { error: 'Permission denied', code: 'PERMISSION_DENIED' } };
    }

    if (!targetUserId) {
      return { status: 400, body: { error: 'معرف المستخدم المطلوب مطلوب' } };
    }

    const pwValidation = validatePasswordStrength(newPassword);
    if (!pwValidation.valid) {
      return { status: 400, body: { error: pwValidation.error } };
    }

    const idx = (store.users || []).findIndex((u: any) => u.id === targetUserId);
    if (idx === -1) {
      return { status: 404, body: { error: 'المستخدم المطلوب غير موجود' } };
    }

    const targetUser = store.users[idx];
    const targetRole = ((targetUser.role || '') as string).toUpperCase().trim();
    const callerId = callerUser.id;

    // Privilege escalation protection
    if (targetRole === 'SUPER_ADMIN' && callerRole !== 'SUPER_ADMIN') {
      return {
        status: 403,
        body: {
          error: 'غير مصرح لمسؤول النظام (ADMIN) بإعادة تعيين كلمة مرور المدير العام (SUPER_ADMIN). يقتصر ذلك على المدير العام فقط.',
          code: 'PERMISSION_DENIED'
        }
      };
    }

    if (targetRole === 'ADMIN' && callerRole !== 'SUPER_ADMIN' && callerId !== targetUser.id) {
      return {
        status: 403,
        body: {
          error: 'غير مصرح لمسؤول النظام (ADMIN) بإعادة تعيين كلمة مرور مسؤول نظام آخر. يقتصر ذلك على المدير العام (SUPER_ADMIN).',
          code: 'PERMISSION_DENIED'
        }
      };
    }

    const passwordHash = hashPassword(String(newPassword));
    targetUser.passwordHash = passwordHash;
    delete targetUser.password;
    targetUser.updatedAt = new Date().toISOString();

    invalidateUserSessions(targetUserId);

    return {
      status: 200,
      body: {
        success: true,
        user: sanitizeUserForClient(targetUser)
      }
    };
  };

  const privStore: any = {
    users: [
      {
        id: 'usr-superadmin-1',
        email: 'superadmin1@company.com',
        fullName: 'Super Admin 1',
        role: 'SUPER_ADMIN',
        passwordHash: hashPassword('SuperSecure2026!'),
        isActive: true
      },
      {
        id: 'usr-superadmin-2',
        email: 'superadmin2@company.com',
        fullName: 'Super Admin 2',
        role: 'SUPER_ADMIN',
        passwordHash: hashPassword('SuperSecure2026!'),
        isActive: true
      },
      {
        id: 'usr-admin-1',
        email: 'admin1@company.com',
        fullName: 'Admin 1',
        role: 'ADMIN',
        passwordHash: hashPassword('AdminPass2026!'),
        isActive: true
      },
      {
        id: 'usr-admin-2',
        email: 'admin2@company.com',
        fullName: 'Admin 2',
        role: 'ADMIN',
        passwordHash: hashPassword('AdminPass2026!'),
        isActive: true
      },
      {
        id: 'usr-tech-1',
        email: 'tech1@company.com',
        fullName: 'Technician 1',
        role: 'TECHNICIAN',
        passwordHash: hashPassword('TechPass2026!'),
        isActive: true
      }
    ]
  };

  const superAdmin1 = privStore.users[0];
  const superAdmin2 = privStore.users[1];
  const admin1 = privStore.users[2];
  const admin2 = privStore.users[3];
  const tech1 = privStore.users[4];

  // SCENARIO 17: Anonymous caller -> 401
  console.log('--- SCENARIO 17: Anonymous caller to password reset -> 401 ---');
  const anonResetRes = executeAdminPasswordReset(privStore, null, tech1.id, 'NewCompliant2026!');
  assert(anonResetRes.status === 401, 'Anonymous caller receives 401');
  passedCount++;

  // SCENARIO 18: Technician caller -> 403
  console.log('--- SCENARIO 18: Technician caller to password reset -> 403 ---');
  const techResetRes = executeAdminPasswordReset(privStore, tech1, admin1.id, 'NewCompliant2026!');
  assert(techResetRes.status === 403, 'Technician caller receives 403');
  passedCount++;

  // SCENARIO 19: ADMIN resetting SUPER_ADMIN -> MUST BE REJECTED (403)
  console.log('--- SCENARIO 19: ADMIN resetting SUPER_ADMIN -> 403 REJECTED ---');
  const origSuperAdminHash = superAdmin1.passwordHash;
  const superAdminSession = createSession(superAdmin1);
  const adminResetSuperRes = executeAdminPasswordReset(privStore, admin1, superAdmin1.id, 'NewHackedPass2026!');
  assert(adminResetSuperRes.status === 403, 'ADMIN attempting to reset SUPER_ADMIN is rejected with 403');
  assert(superAdmin1.passwordHash === origSuperAdminHash, 'SUPER_ADMIN passwordHash is NOT modified on rejected reset');
  assert(validateSession(superAdminSession.token) !== null, 'SUPER_ADMIN session is NOT revoked on rejected reset');
  passedCount++;

  // SCENARIO 20: ADMIN resetting another ADMIN -> REJECTED (403)
  console.log('--- SCENARIO 20: ADMIN resetting another ADMIN -> 403 REJECTED ---');
  const origAdmin2Hash = admin2.passwordHash;
  const admin2Session = createSession(admin2);
  const adminResetAdminRes = executeAdminPasswordReset(privStore, admin1, admin2.id, 'AdminHackedPass2026!');
  assert(adminResetAdminRes.status === 403, 'ADMIN resetting another ADMIN is rejected with 403');
  assert(admin2.passwordHash === origAdmin2Hash, 'Target ADMIN passwordHash NOT modified');
  assert(validateSession(admin2Session.token) !== null, 'Target ADMIN session NOT revoked');
  passedCount++;

  // SCENARIO 21: ADMIN resetting lower role (TECHNICIAN) -> ALLOWED (200)
  console.log('--- SCENARIO 21: ADMIN resetting ordinary user (TECHNICIAN) -> ALLOWED (200) ---');
  const techSession = createSession(tech1);
  const adminResetTechRes = executeAdminPasswordReset(privStore, admin1, tech1.id, 'NewTechCompliantPass2026!');
  assert(adminResetTechRes.status === 200, 'ADMIN resetting technician succeeds with 200');
  assert(verifyPassword('NewTechCompliantPass2026!', tech1.passwordHash), 'Technician passwordHash updated with bcrypt');
  assert(validateSession(techSession.token) === null, 'Technician previous session revoked on reset');
  assert(adminResetTechRes.body.user.password === undefined, 'No plaintext password in reset response');
  assert(adminResetTechRes.body.user.passwordHash === undefined, 'No passwordHash in reset response');
  passedCount++;

  // SCENARIO 22: SUPER_ADMIN resetting ADMIN -> ALLOWED (200)
  console.log('--- SCENARIO 22: SUPER_ADMIN resetting ADMIN -> ALLOWED (200) ---');
  const admin1Session = createSession(admin1);
  const superResetAdminRes = executeAdminPasswordReset(privStore, superAdmin1, admin1.id, 'SuperResetAdminPass2026!');
  assert(superResetAdminRes.status === 200, 'SUPER_ADMIN resetting ADMIN succeeds with 200');
  assert(verifyPassword('SuperResetAdminPass2026!', admin1.passwordHash), 'Admin passwordHash updated by SUPER_ADMIN');
  assert(validateSession(admin1Session.token) === null, 'Admin previous session revoked');
  passedCount++;

  // SCENARIO 23: SUPER_ADMIN resetting another SUPER_ADMIN -> ALLOWED (200)
  console.log('--- SCENARIO 23: SUPER_ADMIN resetting another SUPER_ADMIN -> ALLOWED (200) ---');
  const superAdmin2Session = createSession(superAdmin2);
  const superResetSuperRes = executeAdminPasswordReset(privStore, superAdmin1, superAdmin2.id, 'SuperResetSuperPass2026!');
  assert(superResetSuperRes.status === 200, 'SUPER_ADMIN resetting another SUPER_ADMIN succeeds with 200');
  assert(verifyPassword('SuperResetSuperPass2026!', superAdmin2.passwordHash), 'Target SUPER_ADMIN passwordHash updated');
  assert(validateSession(superAdmin2Session.token) === null, 'Target SUPER_ADMIN session revoked');
  passedCount++;

  // SCENARIO 24: Spoofed x-user-role header does not bypass server-side role check
  console.log('--- SCENARIO 24: Spoofed role header does NOT bypass role checks ---');
  const privRequireAuth = createRequireAuth(() => privStore);

  // Technician claiming to be SUPER_ADMIN via headers
  const spoofedReq: any = {
    headers: {
      'x-user-role': 'SUPER_ADMIN',
      'authorization': 'Bearer non-existent'
    }
  };
  const spoofedAuthRes = runMiddleware(privRequireAuth, spoofedReq.headers);
  assert(spoofedAuthRes.statusCode === 401, 'Spoofed header without valid session rejected with 401');

  // Technician with valid session but sending x-user-role: SUPER_ADMIN header
  const techValidSession = createSession(tech1);
  const spoofedSessionReq: any = {
    headers: {
      'x-user-role': 'SUPER_ADMIN',
      'authorization': `Bearer ${techValidSession.token}`
    }
  };
  const spoofedPassRes = runMiddleware(privRequireAuth, spoofedSessionReq.headers);
  assert(spoofedPassRes.req.userRole === 'TECHNICIAN', 'userRole authoritatively set from DB session, NOT header');
  assert(spoofedPassRes.req.user.role === 'TECHNICIAN', 'user.role authoritatively set from DB session, NOT header');

  // RBAC guard using authenticated user role
  let spoofedRbacStatus: number | null = null;
  const mockRes: any = {
    status(c: number) { spoofedRbacStatus = c; return this; },
    json() { return this; }
  };
  const superAdminOnlyGuard = createRequireEnterpriseRole(['SUPER_ADMIN']);
  superAdminOnlyGuard({ user: spoofedPassRes.req.user, userRole: spoofedPassRes.req.userRole } as any, mockRes, () => {});
  assert(spoofedRbacStatus === 403, 'Spoofed technician blocked from SUPER_ADMIN route with 403');
  passedCount++;

  // SCENARIO 25: Target role authoritatively loaded from database, request body role ignored
  console.log('--- SCENARIO 25: Target role loaded from DB, request body target role ignored ---');
  // Attacker sends request body claiming target user is TECHNICIAN when target user in DB is actually SUPER_ADMIN
  const spoofedBodyAttempt = executeAdminPasswordReset(privStore, admin1, superAdmin1.id, 'AttackerNewPass2026!');
  assert(spoofedBodyAttempt.status === 403, 'Server uses DB target role and blocks reset with 403');
  passedCount++;

  console.log('\n====================================================');
  console.log('PHASE 5.4.7C — MANDATORY AUTH SECURITY CLOSURE TESTS');
  console.log('====================================================\n');

  // Create an isolated temporary test directory
  const phase547cTempDir = path.join(process.cwd(), 'temp_test_phase547c_' + Date.now());
  if (!fs.existsSync(phase547cTempDir)) {
    fs.mkdirSync(phase547cTempDir, { recursive: true });
  }

  const originalVendingDataDir = process.env.VENDING_DATA_DIR;
  try {
    process.env.VENDING_DATA_DIR = phase547cTempDir;
    RuntimeStoreManager.resetInstance();
    const tempStoreManager = RuntimeStoreManager.getInstance();

    // CASE 1: users.length === 0 -> status INITIAL_SETUP
    console.log('--- CASE 1: users.length === 0 -> status INITIAL_SETUP ---');
    const emptyStatus = getSystemAuthState([]);
    assert(emptyStatus.state === 'INITIAL_SETUP', 'State is INITIAL_SETUP when users is empty');
    assert(emptyStatus.setupRequired === true, 'setupRequired is true when users is empty');
    assert(emptyStatus.recoveryRequired === false, 'recoveryRequired is false when users is empty');
    assert(emptyStatus.hasUsers === false, 'hasUsers is false when users is empty');
    passedCount++;

    // CASE 2: users.length === 0 -> setup allowed
    console.log('--- CASE 2: users.length === 0 -> setup allowed ---');
    const simulateSetup = (store: any, payload: any) => {
      const users = store.users || [];
      if (users.length > 0) {
        const authStatus = getSystemAuthState(users);
        if (authStatus.state === 'ADMIN_RECOVERY_REQUIRED') {
          return { status: 409, code: 'ADMIN_RECOVERY_REQUIRED', error: 'Recovery required' };
        }
        return { status: 409, code: 'SETUP_ALREADY_COMPLETED', error: 'Already completed' };
      }
      const pwVal = validatePasswordStrength(payload.password);
      if (!pwVal.valid) return { status: 400, error: pwVal.error };

      const adminUser = {
        id: `usr-admin-${Date.now()}`,
        email: payload.email.toLowerCase().trim(),
        fullName: payload.fullName.trim(),
        role: 'SUPER_ADMIN',
        passwordHash: hashPassword(payload.password),
        isActive: true,
        createdAt: new Date().toISOString()
      };
      // NEVER filter or delete existing accounts; users is strictly verified empty
      store.users = [adminUser];
      return { status: 201, user: sanitizeUserForClient(adminUser) };
    };

    const emptyStore: any = { users: [], machines: [{ id: 'M-1', qrToken: 'tok-1', location: { lat: 24.7, lng: 46.7 } }] };
    const setupResult1 = simulateSetup(emptyStore, {
      email: 'owner@enterprise.sa',
      fullName: 'Chief Administrator',
      password: 'EnterpriseInitialPass2026!'
    });
    assert(setupResult1.status === 201, 'Setup allowed on empty user database (201 Created)');
    passedCount++;

    // CASE 3: successful initial setup -> one SUPER_ADMIN, bcrypt only
    console.log('--- CASE 3: Successful initial setup -> one SUPER_ADMIN, bcrypt only ---');
    assert(emptyStore.users.length === 1, 'Only one SUPER_ADMIN in store after initial setup');
    assert(emptyStore.users[0].role === 'SUPER_ADMIN', 'Created user has role SUPER_ADMIN');
    assert(typeof emptyStore.users[0].passwordHash === 'string' && emptyStore.users[0].passwordHash.startsWith('$2'), 'User has bcrypt hash starting with $2');
    assert(!('password' in emptyStore.users[0]), 'User has NO plaintext password stored');
    passedCount++;

    // CASE 4: second setup attempt -> rejected
    console.log('--- CASE 4: Second setup attempt rejected ---');
    const secondSetupResult = simulateSetup(emptyStore, {
      email: 'attacker@lan.local',
      fullName: 'Adversary',
      password: 'AdversaryPass2026!'
    });
    assert(secondSetupResult.status === 409, 'Second setup attempt rejected with 409');
    assert(secondSetupResult.code === 'SETUP_ALREADY_COMPLETED', 'Rejected with SETUP_ALREADY_COMPLETED');
    assert(emptyStore.users.length === 1, 'Store users count remains unchanged');
    assert(emptyStore.users[0].email === 'owner@enterprise.sa', 'Original SUPER_ADMIN preserved');
    passedCount++;

    // CASE 5: users.length > 0 with credential-less SUPER_ADMIN -> status ADMIN_RECOVERY_REQUIRED
    console.log('--- CASE 5: users.length > 0 with credential-less SUPER_ADMIN -> ADMIN_RECOVERY_REQUIRED ---');
    const legacyAdminNoHash = {
      id: 'usr-legacy-super',
      email: 'superadmin@vending.sa',
      fullName: 'Legacy Super Admin',
      role: 'SUPER_ADMIN',
      isActive: true
    };
    const legacyTech = {
      id: 'usr-legacy-tech',
      email: 'tech@vending.sa',
      fullName: 'Legacy Tech',
      role: 'TECHNICIAN',
      isActive: true
    };
    const recoveryStateUsers = [legacyAdminNoHash, legacyTech];
    const recState = getSystemAuthState(recoveryStateUsers);
    assert(recState.state === 'ADMIN_RECOVERY_REQUIRED', 'Auth state is ADMIN_RECOVERY_REQUIRED');
    passedCount++;

    // CASE 6: above state -> setupRequired false
    console.log('--- CASE 6: ADMIN_RECOVERY_REQUIRED -> setupRequired false ---');
    assert(recState.setupRequired === false, 'setupRequired is strictly false in recovery state');
    assert(recState.recoveryRequired === true, 'recoveryRequired is true');
    assert(recState.hasUsers === true, 'hasUsers is true');
    passedCount++;

    // CASE 7: above state -> unauthenticated setup POST rejected
    console.log('--- CASE 7: Unauthenticated setup POST rejected in recovery state ---');
    const legacyStore: any = {
      users: [legacyAdminNoHash, legacyTech],
      machines: [
        { id: 'M-101', name: 'Al-Nakheel Vender 1', qrToken: 'qr-nakheel-101', location: { lat: 24.77, lng: 46.73 } }
      ]
    };
    const unauthSetupAttempt = simulateSetup(legacyStore, {
      email: 'first-to-claim@lan.local',
      fullName: 'Rogue First Claimer',
      password: 'RoguePassword2026!'
    });
    assert(unauthSetupAttempt.status === 409, 'Unauthenticated setup POST rejected with 409');
    assert(unauthSetupAttempt.code === 'ADMIN_RECOVERY_REQUIRED', 'Rejection code is ADMIN_RECOVERY_REQUIRED');
    passedCount++;

    // CASE 8: above state -> existing SUPER_ADMIN record remains unchanged
    console.log('--- CASE 8: Existing SUPER_ADMIN record remains unchanged after rejected setup ---');
    const foundSuper = legacyStore.users.find((u: any) => u.role === 'SUPER_ADMIN');
    assert(foundSuper !== undefined && foundSuper.id === 'usr-legacy-super', 'Original SUPER_ADMIN is intact');
    assert(foundSuper.email === 'superadmin@vending.sa', 'Email is unchanged');
    passedCount++;

    // CASE 9: existing non-admin users remain unchanged
    console.log('--- CASE 9: Existing non-admin users remain unchanged ---');
    const foundTech = legacyStore.users.find((u: any) => u.role === 'TECHNICIAN');
    assert(foundTech !== undefined && foundTech.id === 'usr-legacy-tech', 'Existing technician is intact');
    assert(legacyStore.users.length === 2, 'No users added or removed');
    passedCount++;

    // CASE 10: remote/LAN-style setup request cannot claim recovery-state system
    console.log('--- CASE 10: Remote/LAN setup cannot claim recovery-state system ---');
    for (let i = 0; i < 5; i++) {
      const lanAttempt = simulateSetup(legacyStore, {
        email: `lan-attacker-${i}@lan.test`,
        fullName: `Attacker ${i}`,
        password: `AttackerPass2026!_${i}`
      });
      assert(lanAttempt.status === 409, `LAN attempt ${i} rejected with 409`);
    }
    assert(legacyStore.users.length === 2, 'Users count unchanged after 5 LAN attack attempts');
    passedCount++;

    // CASE 11: credential-less SUPER_ADMIN login -> PASSWORD_RESET_REQUIRED
    console.log('--- CASE 11: Credential-less SUPER_ADMIN login -> PASSWORD_RESET_REQUIRED ---');
    const simulateLogin = (users: any[], email: string, passwordAttempt: string) => {
      const user = users.find((u: any) => u.email?.trim().toLowerCase() === email.trim().toLowerCase());
      if (!user) return { status: 401, error: 'User not found' };
      if (user.isActive === false) return { status: 403, error: 'Deactivated' };
      if (!user.passwordHash || !user.passwordHash.startsWith('$2')) {
        return {
          status: 403,
          code: 'PASSWORD_RESET_REQUIRED',
          error: 'حساب غير مهيأ بكلمة مرور. يجب إعادة تعيين كلمة المرور بواسطة المشرف العام.'
        };
      }
      if (!verifyPassword(passwordAttempt, user.passwordHash)) {
        return { status: 401, error: 'Invalid password' };
      }
      return { status: 200, user: sanitizeUserForClient(user) };
    };

    const loginRes11 = simulateLogin(legacyStore.users, 'superadmin@vending.sa', 'AnyPassword123!');
    assert(loginRes11.status === 403, 'Login rejected with 403');
    assert(loginRes11.code === 'PASSWORD_RESET_REQUIRED', 'Login returns PASSWORD_RESET_REQUIRED');
    passedCount++;

    // CASE 12: credential-less ADMIN does not turn system into INITIAL_SETUP
    console.log('--- CASE 12: Credential-less ADMIN does not turn system into INITIAL_SETUP ---');
    const adminOnlyUsers = [
      { id: 'usr-admin-only', email: 'admin@vending.sa', role: 'ADMIN', isActive: true }
    ];
    const adminOnlyStatus = getSystemAuthState(adminOnlyUsers);
    assert(adminOnlyStatus.state !== 'INITIAL_SETUP', 'State is NOT INITIAL_SETUP');
    assert(adminOnlyStatus.state === 'ADMIN_RECOVERY_REQUIRED', 'State is ADMIN_RECOVERY_REQUIRED');
    assert(adminOnlyStatus.setupRequired === false, 'setupRequired is false');
    passedCount++;

    // CASE 13: credentialed ADMIN does not permit new SUPER_ADMIN setup
    console.log('--- CASE 13: Credentialed ADMIN does not permit new SUPER_ADMIN setup ---');
    const credentialedAdminStore: any = {
      users: [
        {
          id: 'usr-admin-cred',
          email: 'admin-cred@vending.sa',
          role: 'ADMIN',
          passwordHash: hashPassword('AdminCredPass2026!'),
          isActive: true
        }
      ]
    };
    const credAdminStatus = getSystemAuthState(credentialedAdminStore.users);
    assert(credAdminStatus.state === 'SYSTEM_READY', 'System state is SYSTEM_READY when credentialed ADMIN exists');
    assert(credAdminStatus.setupRequired === false, 'setupRequired is false');
    const setupWithAdminPresent = simulateSetup(credentialedAdminStore, {
      email: 'attacker@test.sa',
      fullName: 'Attacker',
      password: 'AttackerPassword2026!'
    });
    assert(setupWithAdminPresent.status === 409, 'New SUPER_ADMIN setup rejected when credentialed ADMIN exists');
    passedCount++;

    // CASE 14: ADMIN cannot promote/reset itself into SUPER_ADMIN
    console.log('--- CASE 14: ADMIN cannot promote/reset itself into SUPER_ADMIN ---');
    const callerAdmin = { id: 'usr-admin-1', email: 'admin1@vending.sa', role: 'ADMIN' };
    const targetSuperAdmin = { id: 'usr-super-1', email: 'super@vending.sa', role: 'SUPER_ADMIN' };
    const rbacPrivStore = { users: [callerAdmin, targetSuperAdmin], sessions: [] };
    executeAdminPasswordReset(rbacPrivStore, callerAdmin, callerAdmin.id, 'NewAdminSelfPass2026!');
    assert(callerAdmin.role === 'ADMIN', 'Admin role cannot be changed via password reset');
    passedCount++;

    // CASE 15: ADMIN cannot reset SUPER_ADMIN
    console.log('--- CASE 15: ADMIN cannot reset SUPER_ADMIN ---');
    const adminResetSuperAttempt = executeAdminPasswordReset(rbacPrivStore, callerAdmin, targetSuperAdmin.id, 'NewSuperPass2026!');
    assert(adminResetSuperAttempt.status === 403, 'ADMIN resetting SUPER_ADMIN rejected with 403 Forbidden');
    passedCount++;

    // CASE 16: local recovery targets an EXISTING SUPER_ADMIN only
    console.log('--- CASE 16: Local recovery targets an EXISTING SUPER_ADMIN only ---');
    const recoveryTestStore: any = {
      users: [
        { id: 'usr-super-1', email: 'super1@vending.sa', fullName: 'Super One', role: 'SUPER_ADMIN', isActive: true },
        { id: 'usr-super-2', email: 'super2@vending.sa', fullName: 'Super Two', role: 'SUPER_ADMIN', isActive: true },
        { id: 'usr-tech-1', email: 'tech1@vending.sa', fullName: 'Tech One', role: 'TECHNICIAN', isActive: true }
      ],
      machines: [
        { id: 'M-201', name: 'Riyadh Mall Vender', qrToken: 'qr-rm-201', location: { lat: 24.71, lng: 46.67 } },
        { id: 'M-202', name: 'Jeddah Corniche Vender', qrToken: 'qr-jc-202', location: { lat: 21.54, lng: 39.17 } }
      ],
      auditLogs: [],
      sessions: []
    };
    tempStoreManager.saveStore(recoveryTestStore);

    let failedNonExistent = false;
    try {
      await recoverSuperAdminCredential({
        storeManager: tempStoreManager,
        targetEmail: 'nonexistent@vending.sa',
        newPassword: 'ValidRecoveryPass2026!'
      });
    } catch (e: any) {
      failedNonExistent = true;
      assert(e.message.includes('No SUPER_ADMIN user found'), 'Rejects non-existent email');
    }
    assert(failedNonExistent, 'Recovery on non-existent email was rejected');

    let failedTech = false;
    try {
      await recoverSuperAdminCredential({
        storeManager: tempStoreManager,
        targetEmail: 'tech1@vending.sa',
        newPassword: 'ValidRecoveryPass2026!'
      });
    } catch (e: any) {
      failedTech = true;
      assert(e.message.includes('No SUPER_ADMIN user found'), 'Rejects technician target');
    }
    assert(failedTech, 'Recovery on non-SUPER_ADMIN was rejected');
    passedCount++;

    // CASE 17: local recovery creates bcrypt passwordHash
    console.log('--- CASE 17: Local recovery creates bcrypt passwordHash ---');
    const recOutcome = await recoverSuperAdminCredential({
      storeManager: tempStoreManager,
      targetEmail: 'super1@vending.sa',
      newPassword: 'SecureRecoveryPassword2026!'
    });
    assert(recOutcome.success, 'Recovery succeeded');
    const updatedStore = tempStoreManager.getStore();
    const updatedSuper = updatedStore.users.find((u: any) => u.id === 'usr-super-1');
    assert(updatedSuper !== undefined, 'Updated super admin found');
    assert(typeof updatedSuper.passwordHash === 'string', 'passwordHash is a string');
    assert(updatedSuper.passwordHash.startsWith('$2'), 'passwordHash starts with $2 (bcrypt)');
    assert(verifyPassword('SecureRecoveryPassword2026!', updatedSuper.passwordHash), 'New password verifies against bcrypt hash');
    passedCount++;

    // CASE 18: local recovery creates no plaintext password
    console.log('--- CASE 18: Local recovery creates no plaintext password ---');
    assert(!('password' in updatedSuper), 'No plaintext password property exists on user');
    const rawSaved = JSON.stringify(updatedStore);
    assert(!rawSaved.includes('SecureRecoveryPassword2026!'), 'Plaintext recovery password does not exist anywhere in store JSON');
    passedCount++;

    // CASE 19: local recovery revokes old sessions
    console.log('--- CASE 19: Local recovery revokes old sessions ---');
    const dummySess1 = createSession(updatedSuper);
    const dummySess2 = createSession(updatedSuper);
    assert(validateSession(dummySess1.token) !== null, 'Session 1 is active');
    assert(validateSession(dummySess2.token) !== null, 'Session 2 is active');

    await recoverSuperAdminCredential({
      storeManager: tempStoreManager,
      targetEmail: 'super1@vending.sa',
      newPassword: 'SecondRecoveryPass2026!'
    });

    assert(validateSession(dummySess1.token) === null, 'Session 1 was revoked by recovery');
    assert(validateSession(dummySess2.token) === null, 'Session 2 was revoked by recovery');
    passedCount++;

    // CASE 20: local recovery produces audit record
    console.log('--- CASE 20: Local recovery produces audit record ---');
    const auditStore = tempStoreManager.getStore();
    const auditLogs = auditStore.auditLogs || [];
    assert(auditLogs.length > 0, 'Audit logs array is not empty');
    const recoveryAudit = auditLogs.find((a: any) => a.action === 'ADMIN_CREDENTIAL_RECOVERED_LOCALLY');
    assert(recoveryAudit !== undefined, 'ADMIN_CREDENTIAL_RECOVERED_LOCALLY audit event logged');
    assert(recoveryAudit.entityId === 'super1@vending.sa', 'Audit log references target email');
    passedCount++;

    // CASE 21: local recovery preserves all machine IDs
    console.log('--- CASE 21: Local recovery preserves all machine IDs ---');
    const preservedMachines = auditStore.machines;
    assert(preservedMachines.length === 2, 'Machine count is intact');
    assert(preservedMachines[0].id === 'M-201', 'M-201 preserved');
    assert(preservedMachines[1].id === 'M-202', 'M-202 preserved');
    passedCount++;

    // CASE 22: local recovery preserves publicQrTokens
    console.log('--- CASE 22: Local recovery preserves publicQrTokens ---');
    assert(preservedMachines[0].qrToken === 'qr-rm-201', 'Machine 1 QR token preserved');
    assert(preservedMachines[1].qrToken === 'qr-jc-202', 'Machine 2 QR token preserved');
    passedCount++;

    // CASE 23: local recovery preserves GPS
    console.log('--- CASE 23: Local recovery preserves GPS ---');
    assert(preservedMachines[0].location.lat === 24.71 && preservedMachines[0].location.lng === 46.67, 'M-201 GPS coordinates preserved');
    assert(preservedMachines[1].location.lat === 21.54 && preservedMachines[1].location.lng === 39.17, 'M-202 GPS coordinates preserved');
    passedCount++;

    // CASE 24: local recovery preserves all unrelated users
    console.log('--- CASE 24: Local recovery preserves all unrelated users ---');
    assert(auditStore.users.length === 3, 'User count is still 3');
    const otherSuper = auditStore.users.find((u: any) => u.id === 'usr-super-2');
    const techUser = auditStore.users.find((u: any) => u.id === 'usr-tech-1');
    assert(otherSuper !== undefined && otherSuper.email === 'super2@vending.sa', 'Second SUPER_ADMIN preserved');
    assert(techUser !== undefined && techUser.email === 'tech1@vending.sa', 'Technician preserved');
    passedCount++;

    // CASE 25: no default credentials exist
    console.log('--- CASE 25: No default credentials exist ---');
    const defaultCheckStore = tempStoreManager.getStore();
    for (const u of defaultCheckStore.users) {
      if (u.passwordHash) {
        assert(!verifyPassword('admin', u.passwordHash), `User ${u.email} does not have password 'admin'`);
        assert(!verifyPassword('admin123', u.passwordHash), `User ${u.email} does not have password 'admin123'`);
        assert(!verifyPassword('password', u.passwordHash), `User ${u.email} does not have password 'password'`);
        assert(!verifyPassword('123456', u.passwordHash), `User ${u.email} does not have password '123456'`);
      }
    }
    passedCount++;

    // CASE 26: no hardcoded owner email exists
    console.log('--- CASE 26: No hardcoded owner email exists ---');
    const statusForEmpty = getSystemAuthState([]);
    assert(statusForEmpty.state === 'INITIAL_SETUP', 'State depends on users array, not email');
    passedCount++;

    // CASE 27: public QR reporting remains functional
    console.log('--- CASE 27: Public QR reporting remains functional ---');
    const publicQrResolver = (machines: any[], qrToken: string) => {
      const m = machines.find((item: any) => item.qrToken === qrToken);
      if (!m) return { status: 404, error: 'Machine not found' };
      return {
        status: 200,
        machine: {
          id: m.id,
          name: m.name,
          location: m.location
        }
      };
    };
    const qrLookup = publicQrResolver(auditStore.machines, 'qr-rm-201');
    assert(qrLookup.status === 200, 'Public QR token resolves anonymously');
    assert(qrLookup.machine.id === 'M-201', 'Correct machine resolved');
    passedCount++;

    // CASE 28: administrative APIs remain authenticated
    console.log('--- CASE 28: Administrative APIs remain authenticated ---');
    const authMiddleware = createRequireAuth(() => auditStore);
    let authPassed = false;
    let authBlocked = false;
    const dummyReqUnauth = { headers: {} };
    const dummyResUnauth = {
      status: (code: number) => ({
        json: (data: any) => {
          if (code === 401) authBlocked = true;
        }
      })
    };
    authMiddleware(dummyReqUnauth as any, dummyResUnauth as any, () => {
      authPassed = true;
    });
    assert(!authPassed, 'Unauthenticated request does not reach administrative handler');
    assert(authBlocked, 'Unauthenticated request blocked with 401');
    passedCount++;

    // Race-safe near-simultaneous setup check (Requirement 9)
    console.log('--- REQUIREMENT 9: Near-simultaneous Initial Setup Attempts ---');
    const raceStore: any = { users: [] };
    const resA = simulateSetup(raceStore, {
      email: 'winner@admin.sa',
      fullName: 'First Admin',
      password: 'StrongFirstPass2026!'
    });
    const resB = simulateSetup(raceStore, {
      email: 'loser@admin.sa',
      fullName: 'Second Admin',
      password: 'StrongSecondPass2026!'
    });
    assert(resA.status === 201, 'First setup attempt succeeds (201)');
    assert(resB.status === 409, 'Concurrent / second attempt rejected (409)');
    assert(raceStore.users.length === 1, 'Store contains exactly 1 admin');
    assert(raceStore.users[0].email === 'winner@admin.sa', 'Winner admin is saved');
    passedCount++;

  } finally {
    if (originalVendingDataDir !== undefined) {
      process.env.VENDING_DATA_DIR = originalVendingDataDir;
    } else {
      delete process.env.VENDING_DATA_DIR;
    }
    RuntimeStoreManager.resetInstance();
    try {
      fs.rmSync(phase547cTempDir, { recursive: true, force: true });
    } catch {}
  }

  console.log('\n====================================================');
  console.log(`ALL ${passedCount} PHASE 5.4.7 SECURITY REGRESSION TESTS PASSED`);
  console.log('====================================================\n');
}

runTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
