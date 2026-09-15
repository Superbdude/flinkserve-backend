/* eslint-disable no-console */
/**
 * Live end-to-end verification against the deployed backend.
 * Run: node live-verify.js
 */
const BASE = 'https://flinkserve-backend.onrender.com';
const ORIGIN = 'https://flinkserve.web.app';

const stamp = Date.now();
const testEmail = `qa.probe.${stamp}@example.com`;
const testPhone = `+23480${String(stamp).slice(-8)}`;
const password = 'Secret123';
const role = 'service_seeker';

let pass = 0;
let fail = 0;

const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const req = async (path, { method = 'GET', body, token } = {}) => {
  const headers = { Origin: ORIGIN };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  let json = null;
  try { json = await res.json(); } catch { /* non-JSON body */ }

  return {
    status: res.status,
    acao: res.headers.get('access-control-allow-origin'),
    json
  };
};

(async () => {
  console.log(`\n=== FlinkServe live verification (${BASE}) ===\n`);

  // 1. Health
  const health = await req('/health');
  check('GET /health returns 200', health.status === 200, `status=${health.status}`);
  check('/health sets ACAO for Firebase origin', health.acao === ORIGIN, `acao=${health.acao}`);

  // 2. Services list (public, used by the Browse Services page)
  const services = await req('/api/services');
  const servicesOk = services.status === 200 && services.json && services.json.success;
  check('GET /api/services returns data', servicesOk,
    `status=${services.status} count=${services.json?.data?.services?.length ?? services.json?.count ?? 'n/a'}`);

  // 3. Register a brand new seeker
  const reg = await req('/api/auth/register', {
    method: 'POST',
    body: { name: 'QA Probe', email: testEmail, password, role, phone: testPhone,
      location: { address: 'Lagos, Nigeria', coordinates: { lat: 6.5244, lng: 3.3792 } } }
  });
  check('POST /api/auth/register returns 201', reg.status === 201, `status=${reg.status} msg=${reg.json?.message}`);
  const token = reg.json?.data?.token;
  check('Register returns a JWT', Boolean(token));

  // 4. Duplicate registration must be rejected cleanly (and still carry CORS headers)
  const dup = await req('/api/auth/register', {
    method: 'POST',
    body: { name: 'QA Probe', email: testEmail, password, role, phone: testPhone,
      location: { address: 'Lagos, Nigeria', coordinates: { lat: 6.5244, lng: 3.3792 } } }
  });
  check('Duplicate register returns 400 (not 500)', dup.status === 400, `status=${dup.status} msg=${dup.json?.message}`);

  // 5. Login with the created account
  const login = await req('/api/auth/login', {
    method: 'POST',
    body: { email: testEmail, password, role }
  });
  check('POST /api/auth/login returns 200', login.status === 200, `status=${login.status} msg=${login.json?.message}`);

  // 6. Authenticated /me
  const me = await req('/api/auth/me', { token });
  check('GET /api/auth/me returns the user', me.status === 200 && me.json?.data?.user?.email === testEmail,
    `status=${me.status} email=${me.json?.data?.user?.email}`);

  // 7. Bad credentials should be 401, not 500
  const bad = await req('/api/auth/login', {
    method: 'POST',
    body: { email: testEmail, password: 'WrongPass1', role }
  });
  check('Bad password returns 401 (not 500)', bad.status === 401, `status=${bad.status}`);

  // 8. Bookings (authenticated)
  const bookings = await req('/api/bookings', { token });
  check('GET /api/bookings works when authenticated', bookings.status === 200, `status=${bookings.status}`);

  // 9. Social auth endpoint should reject junk tokens with 401 (not 500/crash)
  const social = await req('/api/auth/social', {
    method: 'POST',
    body: { provider: 'google', idToken: 'invalid-token', role }
  });
  check('POST /api/auth/social rejects invalid token with 401', social.status === 401, `status=${social.status} msg=${social.json?.message}`);

  // 10. Preflight from the Firebase origin
  const pre = await fetch(`${BASE}/api/auth/register`, {
    method: 'OPTIONS',
    headers: {
      Origin: ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type'
    }
  });
  check('Preflight OPTIONS returns 204 + ACAO', pre.status === 204 && pre.headers.get('access-control-allow-origin') === ORIGIN,
    `status=${pre.status} acao=${pre.headers.get('access-control-allow-origin')}`);

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
