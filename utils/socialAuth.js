/**
 * Server-side verification of social sign-in tokens.
 *
 * Google and Facebook ID/access tokens are verified against the official
 * endpoints below, so the backend never trusts identity data sent by the
 * browser. Uses the global `fetch` available in Node 18+.
 */

const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const FACEBOOK_GRAPH_URL = 'https://graph.facebook.com';

/**
 * Verify a Google ID token (JWT) via Google's tokeninfo endpoint.
 * @param {string} idToken
 * @returns {Promise<{providerId: string, email: string, name: string, avatar: string, emailVerified: boolean}>}
 */
async function verifyGoogleToken(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    throw Object.assign(new Error('Google credential is required'), { statusCode: 400 });
  }

  const url = `${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`;
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.error_description || !data.sub) {
    throw Object.assign(new Error('Invalid or expired Google credential'), { statusCode: 401 });
  }

  // If a client id is configured, make sure the token was issued for this app.
  const expectedClientId = process.env.GOOGLE_CLIENT_ID;
  if (expectedClientId && data.aud !== expectedClientId) {
    throw Object.assign(new Error('Google credential was issued for a different application'), {
      statusCode: 401
    });
  }

  return {
    providerId: data.sub,
    email: (data.email || '').toLowerCase(),
    name: data.name || (data.email ? data.email.split('@')[0] : 'FlinkServe User'),
    avatar: data.picture || null,
    emailVerified: data.email_verified === 'true' || data.email_verified === true
  };
}

/**
 * Verify a Facebook access token via the Graph API.
 * @param {string} accessToken
 * @returns {Promise<{providerId: string, email: string, name: string, avatar: string, emailVerified: boolean}>}
 */
async function verifyFacebookToken(accessToken) {
  if (!accessToken || typeof accessToken !== 'string') {
    throw Object.assign(new Error('Facebook access token is required'), { statusCode: 400 });
  }

  const appTokenParam = process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET
    ? `&appsecret_proof=${await buildAppSecretProof(accessToken)}`
    : '';

  const url =
    `${FACEBOOK_GRAPH_URL}/me?fields=id,name,email,picture.type(large)` +
    `&access_token=${encodeURIComponent(accessToken)}${appTokenParam}`;

  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.error || !data.id) {
    const message = data.error && data.error.message
      ? data.error.message
      : 'Invalid or expired Facebook access token';
    throw Object.assign(new Error(message), { statusCode: 401 });
  }

  return {
    providerId: data.id,
    email: (data.email || '').toLowerCase(),
    name: data.name || 'FlinkServe User',
    avatar: data.picture && data.picture.data ? data.picture.data.url : null,
    emailVerified: Boolean(data.email)
  };
}

/**
 * Facebook recommends sending appsecret_proof alongside the access token.
 * @param {string} accessToken
 */
async function buildAppSecretProof(accessToken) {
  const crypto = require('crypto');
  return crypto
    .createHmac('sha256', process.env.FACEBOOK_APP_SECRET)
    .update(accessToken)
    .digest('hex');
}

/**
 * Verify a social credential for the given provider.
 * @param {'google'|'facebook'} provider
 * @param {{idToken?: string, accessToken?: string}} credentials
 */
async function verifySocialToken(provider, credentials = {}) {
  switch (provider) {
    case 'google':
      return verifyGoogleToken(credentials.idToken);
    case 'facebook':
      return verifyFacebookToken(credentials.accessToken);
    default:
      throw Object.assign(new Error('Unsupported social provider'), { statusCode: 400 });
  }
}

module.exports = { verifySocialToken, verifyGoogleToken, verifyFacebookToken };