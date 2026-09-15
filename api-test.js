/**
 * End-to-end API smoke test.
 * Run with:  node api-test.js
 * Requires the server to be running on http://localhost:5001
 */
const BASE = process.env.TEST_BASE || 'http://localhost:5001';
const ORIGIN = 'https://flinkserve.web.app';

const stamp = Date.now();
const EMAIL = `smoketest.${stamp}@flinkserve-test.local`;
const PASSWORD = 'TestPass123';

let passed = 0;
let failed = 0;

const check = (label, ok, extra = '') => {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}${extra ? ` - ${extra}` : ''}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${extra ? ` - ${extra}` : ''}`);
  }
};

const call = async (path, { method = 'GET', body, token, origin = ORIGIN } = {}) => {
  const headers = { Origin: origin };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, json, headers: res.headers };
};

const main = async () => {
  console.log('\n=====================================================');
  console.log(' FlinkServe backend API smoke test');
  console.log(` Base: ${BASE}`);
  console.log('=====================================================\n');

  // ---------- 1. Health ----------
  console.log('1) Health check');
  {
    const r = await call('/health');
    check('GET /health returns 200', r.status === 200, `status=${r.status}`);
    check('health payload has status OK', r.json?.status === 'OK');
    check(
      'CORS header present for Firebase origin',
      r.headers.get('access-control-allow-origin') === ORIGIN,
      r.headers.get('access-control-allow-origin') || 'missing'
    );
  }

  // ---------- 2. CORS preflight ----------
  console.log('\n2) CORS preflight (the original failure)');
  {
    const res = await fetch(`${BASE}/api/auth/register`, {
      method: 'OPTIONS',
      headers: {
        Origin: ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    check('OPTIONS preflight returns 2xx', res.status >= 200 && res.status < 300, `status=${res.status}`);
    check(
      'Access-Control-Allow-Origin echoed',
      res.headers.get('access-control-allow-origin') === ORIGIN,
      res.headers.get('access-control-allow-origin') || 'missing'
    );
    check(
      'Access-Control-Allow-Methods includes POST',
      (res.headers.get('access-control-allow-methods') || '').includes('POST')
    );
    check(
      'Access-Control-Allow-Headers includes content-type',
      (res.headers.get('access-control-allow-headers') || '').toLowerCase().includes('content-type')
    );
  }

  // ---------- 3. Registration ----------
  console.log('\n3) Registration');
  let token = null;
  let userId = null;
  {
    const r = await call('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Smoke Test User',
        email: EMAIL,
        password: PASSWORD,
        role: 'service_seeker',
        phone: '+2348012345678',
        location: { address: 'Lagos, Nigeria', coordinates: { lat: 6.5244, lng: 3.3792 } },
      },
    });
    check('POST /api/auth/register returns 2xx', r.status === 201 || r.status === 200, `status=${r.status}`);
    check('response contains a token', Boolean(r.json?.data?.token));
    check('response.user has no password field', r.json?.data?.user?.password === undefined);
    token = r.json?.data?.token;
    userId = r.json?.data?.user?.id || r.json?.data?.user?._id;
  }

  // ---------- 4. Duplicate registration is rejected ----------
  console.log('\n4) Duplicate email rejected');
  {
    const r = await call('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Duplicate',
        email: EMAIL,
        password: PASSWORD,
        role: 'service_seeker',
        phone: '+2348012345678',
        location: { address: 'Lagos', coordinates: { lat: 6.5, lng: 3.3 } },
      },
    });
    check('duplicate email returns 4xx', r.status >= 400 && r.status < 500, `status=${r.status}`);
    check('duplicate response carries CORS header',
      r.headers.get('access-control-allow-origin') === ORIGIN);
  }

  // ---------- 5. Validation ----------
  console.log('\n5) Validation rejects bad input');
  {
    const r = await call('/api/auth/register', {
      method: 'POST',
      body: { name: 'X', email: 'not-an-email', password: '123', role: 'service_seeker' },
    });
    check('invalid payload returns 400', r.status === 400, `status=${r.status}`);
  }

  // ---------- 6. Login ----------
  console.log('\n6) Login');
  {
    const r = await call('/api/auth/login', {
      method: 'POST',
      body: { email: EMAIL, password: PASSWORD, role: 'service_seeker' },
    });
    check('login with correct password returns 200', r.status === 200, `status=${r.status}`);
    check('login returns token', Boolean(r.json?.data?.token));
    if (r.json?.data?.token) token = r.json.data.token;
  }
  {
    const r = await call('/api/auth/login', {
      method: 'POST',
      body: { email: EMAIL, password: 'WrongPassword1', role: 'service_seeker' },
    });
    check('login with wrong password returns 401', r.status === 401, `status=${r.status}`);
  }
  {
    const r = await call('/api/auth/login', {
      method: 'POST',
      body: { email: EMAIL, password: PASSWORD, role: 'service_provider' },
    });
    check('login with wrong role returns 401', r.status === 401, `status=${r.status}`);
  }

  // ---------- 7. Authenticated endpoints ----------
  console.log('\n7) Authenticated endpoints');
  {
    const r = await call('/api/auth/me', { token });
    check('GET /api/auth/me with token returns 200', r.status === 200, `status=${r.status}`);
    check('me returns the right user', r.json?.data?.user?.email === EMAIL);
  }
  {
    const r = await call('/api/auth/me');
    check('GET /api/auth/me without token returns 401', r.status === 401, `status=${r.status}`);
  }

  // ---------- 8. Listing endpoints ----------
  console.log('\n8) Listing endpoints (no 5xx allowed)');
  for (const path of [
    '/api/services',
    '/api/bookings/my-bookings',
    '/api/reviews/provider/000000000000000000000000',
  ]) {
    const r = await call(path, { token });
    check(`GET ${path}`, r.status < 500, `status=${r.status}`);
  }
  {
    const r = await call('/api/services');
    check('GET /api/services has success flag', r.json?.success === true);
  }

  // ---------- 9. Social auth ----------
  console.log('\n9) Social sign-in endpoint');
  {
    const r = await call('/api/auth/social', {
      method: 'POST',
      body: { provider: 'google', idToken: 'clearly.invalid.token' },
    });
    check('invalid Google token rejected with 401', r.status === 401, `status=${r.status}`);
    check('social error carries CORS header',
      r.headers.get('access-control-allow-origin') === ORIGIN);
  }
  {
    const r = await call('/api/auth/social', {
      method: 'POST',
      body: { provider: 'myspace', idToken: 'x' },
    });
    check('unsupported provider returns 400', r.status === 400, `status=${r.status}`);
  }
  {
    const r = await call('/api/auth/social', { method: 'POST', body: { provider: 'google' } });
    check('missing idToken returns 400', r.status === 400, `status=${r.status}`);
  }
  {
    const r = await call('/api/auth/social', {
      method: 'POST',
      body: { provider: 'facebook', accessToken: 'invalid' },
    });
    check('invalid Facebook token rejected', r.status === 401 || r.status === 502, `status=${r.status}`);
  }

  // ---------- 10. Provider registration ----------
  console.log('\n10) Provider registration');
  {
    const r = await call('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Smoke Provider',
        email: `smokeprovider.${stamp}@flinkserve-test.local`,
        password: PASSWORD,
        role: 'service_provider',
        phone: '+2348099999999',
        location: { address: 'Abuja, Nigeria', coordinates: { lat: 9.0765, lng: 7.3986 } },
      },
    });
    check('provider registration succeeds', r.status === 200 || r.status === 201, `status=${r.status}`);
  }

  // ---------- 11. 404 handling ----------
  console.log('\n11) Unknown route handling');
  {
    const r = await call('/api/does-not-exist');
    check('unknown API route returns 404', r.status === 404, `status=${r.status}`);
    check('404 still carries CORS header', r.headers.get('access-control-allow-origin') === ORIGIN);
  }

  // ---------- Cleanup ----------
  try {
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGODB_URI);
    const res = await mongoose.connection
      .collection('users')
      .deleteMany({ email: { $regex: `^smoke(test|provider)\\.${stamp}@` } });
    console.log(`\n Cleaned up ${res.deletedCount} test user(s)`);
    await mongoose.disconnect();
  } catch (err) {
    console.log(`\n Could not clean up test users: ${err.message}`);
  }

  console.log('\n=====================================================');
  console.log(` RESULT: ${passed} passed, ${failed} failed`);
  console.log('=====================================================\n');

  process.exit(failed === 0 ? 0 : 1);
};

main().catch((err) => {
  console.error('Test harness crashed:', err);
  process.exit(1);
});