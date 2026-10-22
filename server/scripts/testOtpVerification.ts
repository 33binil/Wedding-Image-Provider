async function runComprehensiveOtpTests() {
  const BASE = 'http://localhost:8080';
  console.log('🚀 Starting Comprehensive Login OTP Verification Test Suite...\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, name: string, details: any = '') {
    total++;
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}`, details);
    }
  }

  // 11. Existing Super Admin login remains functional
  const adminLoginRes = await fetch(`${BASE}/api/superadmin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'pentaprizmofficial@gmail.com',
      password: 'PentaPrizm2026!',
    }),
  });
  const adminLoginData = await adminLoginRes.json();
  const superAdminToken = adminLoginData.data?.token;
  assert(
    adminLoginRes.status === 200 && adminLoginData.success === true && Boolean(superAdminToken),
    '11. Existing Super Admin login remains functional with designated credentials'
  );

  // 1. Photographer can register without an OTP or activation code
  const testEmail1 = `studio_${Date.now()}_1@example.com`;
  const regRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Starlight Wedding Studio',
      email: testEmail1,
      password: 'StudioPassword2026!',
      confirmPassword: 'StudioPassword2026!',
    }),
  });
  const regData = await regRes.json();
  const regSetCookie = regRes.headers.get('set-cookie') || '';
  assert(
    regRes.status === 201 &&
      regData.success === true &&
      regData.data?.user?.status === 'PENDING' &&
      !regSetCookie.includes('wedding_auth_token'),
    '1. Photographer can register without an OTP; account created with PENDING status and NO authenticated session'
  );
  const photographerId1 = regData.data?.user?._id;

  // 2. Duplicate email registration is rejected
  const dupRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Duplicate Studio',
      email: testEmail1,
      password: 'StudioPassword2026!',
      confirmPassword: 'StudioPassword2026!',
    }),
  });
  const dupData = await dupRes.json();
  assert(
    dupRes.status === 409 && dupData.error === 'EMAIL_ALREADY_EXISTS',
    '2. Duplicate email registration is rejected with 409 EMAIL_ALREADY_EXISTS'
  );

  // 4. Incorrect password is rejected
  const badLoginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail1,
      password: 'WrongPassword999!',
    }),
  });
  const badLoginData = await badLoginRes.json();
  assert(
    badLoginRes.status === 401 && badLoginData.error === 'INVALID_CREDENTIALS',
    '4. Incorrect password rejected with generic 401 INVALID_CREDENTIALS'
  );

  // 3. Correct password starts the OTP step but does not grant dashboard access
  const step1Res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail1,
      password: 'StudioPassword2026!',
    }),
  });
  const step1Data = await step1Res.json();
  const step1Cookie = step1Res.headers.get('set-cookie') || '';
  const preAuthToken1 = step1Data.data?.preAuthToken;
  assert(
    step1Res.status === 200 &&
      step1Data.data?.requiresOtp === true &&
      Boolean(preAuthToken1) &&
      !step1Cookie.includes('wedding_auth_token'),
    '3a. Correct password initiates OTP step and returns restricted preAuthToken without session cookie'
  );

  // 3b. Verify preAuthToken cannot be used as a full session token to access protected APIs
  const preAuthAccessRes = await fetch(`${BASE}/api/events`, {
    headers: { Authorization: `Bearer ${preAuthToken1}` },
  });
  assert(
    preAuthAccessRes.status === 401,
    '3b. Restricted pre-authentication token CANNOT access protected studio APIs (/api/events rejected with 401)'
  );

  // 9. Photographers cannot generate or read administrative OTPs
  const unauthOtpGen = await fetch(`${BASE}/api/superadmin/photographers/${photographerId1}/login-otp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${preAuthToken1}` },
  });
  assert(
    unauthOtpGen.status === 401 || unauthOtpGen.status === 403,
    '9. Photographers/pre-auth cannot access Super Admin OTP generation endpoint'
  );

  // Attempt OTP verification before Super Admin generates an OTP
  const earlyOtpRes = await fetch(`${BASE}/api/auth/verify-login-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preAuthToken: preAuthToken1,
      otp: '123456',
    }),
  });
  const earlyOtpData = await earlyOtpRes.json();
  assert(
    earlyOtpRes.status === 400 && earlyOtpData.error === 'OTP_NOT_GENERATED',
    '6a. OTP verification rejected if Super Admin has not generated an OTP (OTP_NOT_GENERATED)'
  );

  // Super Admin generates 6-digit login OTP for photographer 1
  const genOtpRes = await fetch(`${BASE}/api/superadmin/photographers/${photographerId1}/login-otp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  const genOtpData = await genOtpRes.json();
  const validOtp1 = genOtpData.data?.otp;
  assert(
    genOtpRes.status === 200 && /^\d{6}$/.test(validOtp1),
    '3c. Super Admin successfully generates 6-digit cryptographic login OTP for photographer'
  );

  // Super Admin list photographers includes safe OTP status
  const listPhotogsRes = await fetch(`${BASE}/api/superadmin/photographers`, {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  const listPhotogsData = await listPhotogsRes.json();
  const listedPhotog = listPhotogsData.data?.photographers?.find((p: any) => p._id === photographerId1);
  assert(
    listPhotogsRes.status === 200 &&
      listedPhotog?.otpInfo?.status === 'PENDING' &&
      listedPhotog?.loginOtp === undefined,
    '3d. Super Admin photographer directory safely exposes OTP status without leaking codeHash or plaintext OTP'
  );

  // Register a second photographer for isolation test
  const testEmail2 = `studio_${Date.now()}_2@example.com`;
  const reg2Res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Second Studio',
      email: testEmail2,
      password: 'StudioPassword2026!',
      confirmPassword: 'StudioPassword2026!',
    }),
  });
  const reg2Data = await reg2Res.json();
  const photographerId2 = reg2Data.data?.user?._id;

  // Photographer 2 logs in to get preAuthToken2
  const step1Photog2 = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail2,
      password: 'StudioPassword2026!',
    }),
  });
  const step1Data2 = await step1Photog2.json();
  const preAuthToken2 = step1Data2.data?.preAuthToken;

  // 7. One photographer cannot use another photographer OTP
  const crossOtpRes = await fetch(`${BASE}/api/auth/verify-login-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preAuthToken: preAuthToken2,
      otp: validOtp1, // OTP from photographer 1
    }),
  });
  assert(
    crossOtpRes.status === 400,
    '7. Cross-account OTP redemption strictly blocked (photographer 2 cannot use photographer 1 OTP)'
  );

  // 6b. Incorrect OTP is rejected
  const wrongOtpRes = await fetch(`${BASE}/api/auth/verify-login-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preAuthToken: preAuthToken1,
      otp: '000000',
    }),
  });
  const wrongOtpData = await wrongOtpRes.json();
  assert(
    wrongOtpRes.status === 400 && wrongOtpData.error === 'INVALID_OTP',
    '6b. Incorrect OTP rejected with 400 INVALID_OTP'
  );

  // 5. Correct current OTP grants access
  const verifyRes = await fetch(`${BASE}/api/auth/verify-login-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preAuthToken: preAuthToken1,
      otp: validOtp1,
    }),
  });
  const verifyData = await verifyRes.json();
  const verifyCookie = verifyRes.headers.get('set-cookie') || '';
  const sessionToken = verifyData.data?.token;

  assert(
    verifyRes.status === 200 &&
      verifyData.success === true &&
      verifyData.data?.user?.status === 'ACTIVE' &&
      verifyCookie.includes('wedding_auth_token') &&
      Boolean(sessionToken),
    '5. Correct current OTP successfully verifies login, activates account, and issues wedding_auth_token session cookie'
  );

  // 6c. Replay / Reused OTP is rejected
  const replayRes = await fetch(`${BASE}/api/auth/verify-login-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preAuthToken: preAuthToken1,
      otp: validOtp1,
    }),
  });
  const replayData = await replayRes.json();
  assert(
    replayRes.status === 400 &&
      (replayData.error === 'OTP_ALREADY_USED' || replayData.error === 'OTP_REPLAY_DETECTED'),
    '6c. Replay / reused OTP is rejected (single-use enforcement)'
  );

  // 12. Authenticated photographer can now access their dashboard / events
  const eventsAccessRes = await fetch(`${BASE}/api/events`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  assert(
    eventsAccessRes.status === 200,
    '12. Authenticated photographer successfully accesses protected events with verified session'
  );

  // 10. Suspended accounts cannot gain access
  await fetch(`${BASE}/api/superadmin/photographers/${photographerId1}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${superAdminToken}`,
    },
    body: JSON.stringify({ status: 'SUSPENDED', reason: 'Test suspension' }),
  });

  const suspendedLoginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail1,
      password: 'StudioPassword2026!',
    }),
  });
  const suspendedLoginData = await suspendedLoginRes.json();
  assert(
    suspendedLoginRes.status === 401 && suspendedLoginData.error === 'ACCOUNT_SUSPENDED',
    '10. Suspended photographer account is blocked from login (401 ACCOUNT_SUSPENDED)'
  );

  console.log(`\n🎉 RESULTS: ${passed}/${total} assertions passed successfully!`);
  if (passed !== total) process.exit(1);
}

runComprehensiveOtpTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
