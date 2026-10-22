import handler from '../../api/index.js';
import { EventEmitter } from 'events';

class MockReq extends EventEmitter {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: any;
  constructor(method: string, url: string, headers: Record<string, string> = {}, body?: any) {
    super();
    this.method = method;
    this.url = url;
    this.headers = { ...headers };
    this.body = body;
  }
}

class MockRes extends EventEmitter {
  statusCode = 200;
  headers: Record<string, any> = {};
  body = '';
  setHeader(name: string, value: any) {
    this.headers[name.toLowerCase()] = value;
  }
  getHeader(name: string) {
    return this.headers[name.toLowerCase()];
  }
  writeHead(status: number, headers?: any) {
    this.statusCode = status;
    if (headers) Object.assign(this.headers, headers);
  }
  write(chunk: any) {
    this.body += chunk.toString();
  }
  end(chunk?: any) {
    if (chunk) this.body += chunk.toString();
    this.emit('finish');
  }
}

async function simulateVercelCall(method: string, url: string, headers: Record<string, string> = {}, body?: any): Promise<{ status: number; headers: any; data: any; text: string }> {
  return new Promise(async (resolve, reject) => {
    const req: any = new MockReq(method, url, headers, body);
    const res: any = new MockRes();

    res.on('finish', () => {
      let data: any = null;
      try {
        data = JSON.parse(res.body);
      } catch {
        data = res.body;
      }
      resolve({ status: res.statusCode, headers: res.headers, data, text: res.body });
    });

    try {
      await handler(req, res);
      // If Express did not trigger end via sync, send body chunks
      if (body) {
        req.emit('data', Buffer.from(JSON.stringify(body)));
      }
      req.emit('end');
    } catch (err) {
      reject(err);
    }
  });
}

async function runRoutingVerification() {
  const BASE = 'http://localhost:8080';
  console.log('🔍 Executing Comprehensive Super Admin & Production Routing Verification...\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, title: string, details?: any) {
    total++;
    if (condition) {
      console.log(`✅ PASS: ${title}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${title}`, details || '');
    }
  }

  // 1. GET /api/health
  const healthRes = await fetch(`${BASE}/api/health`);
  const healthData = await healthRes.json();
  assert(
    healthRes.status === 200 && healthData.status === 'healthy',
    '1. GET /api/health responds with 200 OK'
  );

  // 2. POST /api/superadmin/auth/login with INVALID credentials -> Must be 401, NEVER 405!
  const invalidLoginRes = await fetch(`${BASE}/api/superadmin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'wrongadmin@example.com', password: 'BadPassword123' }),
  });
  const invalidLoginData = await invalidLoginRes.json();
  assert(
    invalidLoginRes.status === 401 && invalidLoginData.error === 'INVALID_CREDENTIALS',
    '2. POST /api/superadmin/auth/login with invalid credentials returns 401 (NOT 405 Method Not Allowed)'
  );

  // 3. POST /api/superadmin/auth/login with VALID credentials
  const validLoginRes = await fetch(`${BASE}/api/superadmin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'pentaprizmofficial@gmail.com',
      password: 'PentaPrizm2026!',
    }),
  });
  const validLoginData = await validLoginRes.json();
  const setCookie = validLoginRes.headers.get('set-cookie') || '';
  const superAdminToken = validLoginData.data?.token;

  assert(
    validLoginRes.status === 200 &&
      validLoginData.success === true &&
      Boolean(superAdminToken) &&
      setCookie.includes('penta_superadmin_token'),
    '3. POST /api/superadmin/auth/login with valid credentials returns 200, JWT token, and sets penta_superadmin_token cookie'
  );

  // Extract cookie value for cookie-based testing
  const cookieMatch = setCookie.match(/penta_superadmin_token=([^;]+)/);
  const cookieHeader = cookieMatch ? `penta_superadmin_token=${cookieMatch[1]}` : '';

  // 4. Super Admin session/status endpoint via COOKIE: GET /api/superadmin/auth/me
  const meCookieRes = await fetch(`${BASE}/api/superadmin/auth/me`, {
    headers: { Cookie: cookieHeader },
  });
  const meCookieData = await meCookieRes.json();
  assert(
    meCookieRes.status === 200 &&
      meCookieData.success === true &&
      meCookieData.data?.admin?.email === 'pentaprizmofficial@gmail.com',
    '4a. GET /api/superadmin/auth/me succeeds via penta_superadmin_token cookie'
  );

  // 4b. Super Admin session/status endpoint via BEARER HEADER: GET /api/superadmin/auth/me
  const meHeaderRes = await fetch(`${BASE}/api/superadmin/auth/me`, {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  const meHeaderData = await meHeaderRes.json();
  assert(
    meHeaderRes.status === 200 &&
      meHeaderData.success === true &&
      meHeaderData.data?.admin?.role === 'SUPERADMIN',
    '4b. GET /api/superadmin/auth/me succeeds via Authorization: Bearer token header'
  );

  // 5. Super Admin dashboard statistics endpoint: GET /api/superadmin/dashboard-stats
  const statsRes = await fetch(`${BASE}/api/superadmin/dashboard-stats`, {
    headers: {
      Cookie: cookieHeader,
      Authorization: `Bearer ${superAdminToken}`,
    },
  });
  const statsData = await statsRes.json();
  assert(
    statsRes.status === 200 &&
      statsData.success === true &&
      typeof statsData.data?.totalPhotographers === 'number',
    '5. GET /api/superadmin/dashboard-stats returns valid metrics and statistics'
  );

  // 6. Super Admin photographer directory endpoint: GET /api/superadmin/photographers
  const photogsRes = await fetch(`${BASE}/api/superadmin/photographers`, {
    headers: {
      Cookie: cookieHeader,
      Authorization: `Bearer ${superAdminToken}`,
    },
  });
  const photogsData = await photogsRes.json();
  assert(
    photogsRes.status === 200 &&
      photogsData.success === true &&
      Array.isArray(photogsData.data?.photographers),
    '6. GET /api/superadmin/photographers returns directory list with pagination'
  );

  // 7. Photographer login step 1: POST /api/auth/login
  const testPhotogEmail = `studio_test_${Date.now()}@example.com`;
  // First register photographer
  await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Highland Photo Studio',
      email: testPhotogEmail,
      password: 'StudioPassword2026!',
      confirmPassword: 'StudioPassword2026!',
    }),
  });

  const photogLoginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testPhotogEmail,
      password: 'StudioPassword2026!',
    }),
  });
  const photogLoginData = await photogLoginRes.json();
  const preAuthToken = photogLoginData.data?.preAuthToken;
  assert(
    photogLoginRes.status === 200 &&
      photogLoginData.data?.requiresOtp === true &&
      Boolean(preAuthToken),
    '7. POST /api/auth/login returns requiresOtp: true and restricted preAuthToken'
  );

  // 8. Super Admin generates OTP for this photographer
  const listAfterReg = await fetch(`${BASE}/api/superadmin/photographers?search=${testPhotogEmail}`, {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  const listAfterRegData = await listAfterReg.json();
  const photogId = listAfterRegData.data?.photographers?.[0]?._id;

  const genOtpRes = await fetch(`${BASE}/api/superadmin/photographers/${photogId}/login-otp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  const genOtpData = await genOtpRes.json();
  const validOtp = genOtpData.data?.otp;

  // 9. Photographer login step 2: POST /api/auth/verify-login-otp
  const verifyOtpRes = await fetch(`${BASE}/api/auth/verify-login-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preAuthToken,
      otp: validOtp,
    }),
  });
  const verifyOtpData = await verifyOtpRes.json();
  const photogCookie = verifyOtpRes.headers.get('set-cookie') || '';
  assert(
    verifyOtpRes.status === 200 &&
      verifyOtpData.success === true &&
      verifyOtpData.data?.user?.status === 'ACTIVE' &&
      photogCookie.includes('wedding_auth_token'),
    '8. POST /api/auth/verify-login-otp succeeds with correct OTP and sets wedding_auth_token cookie'
  );

  console.log(`\n🎉 ROUTING & AUTH RESULTS: ${passed}/${total} assertions passed successfully!`);
  if (passed !== total) process.exit(1);
}

runRoutingVerification().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
