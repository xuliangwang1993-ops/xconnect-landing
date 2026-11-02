// Realtime voice auth: verify short-lived signed tokens issued by the AoI gateway
// (aoi-cloud POST /v1/voice/session/start or /v1/voice/token). Spec: aoi-cloud docs/voice-auth.md.
//
// Token: "xcv1.<b64url(JSON)>.<b64url(HMAC-SHA256(VOICE_TOKEN_SECRET, 'xcv1.' + payloadB64))>"
// Claims: v=1, aud="xc-voice", sub, sid, eng, iat, exp, msl (max session seconds), jti.
//
// Env: VOICE_TOKEN_SECRET (shared with the gateway, >= 32 chars)
//      VOICE_AUTH_REQUIRED  "1" (default) enforce | "0" staged rollout only (logs, allows)
import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'xcv1';

export function verifyVoiceToken(secret, token, nowSec = Math.floor(Date.now() / 1000), { leeway = 5 } = {}) {
  if (typeof token !== 'string' || !token) return { ok: false, code: 'missing' };
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false, code: 'malformed' };
  const expected = createHmac('sha256', secret).update(`${PREFIX}.${parts[1]}`).digest();
  let given;
  try {
    given = Buffer.from(parts[2], 'base64url');
  } catch {
    return { ok: false, code: 'malformed' };
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, code: 'bad_signature' };
  let claims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return { ok: false, code: 'malformed' };
  }
  if (claims?.v !== 1 || claims.aud !== 'xc-voice') return { ok: false, code: 'bad_audience' };
  if (!Number.isInteger(claims.exp) || nowSec > claims.exp + leeway) return { ok: false, code: 'expired' };
  if (Number.isInteger(claims.iat) && claims.iat > nowSec + leeway) return { ok: false, code: 'not_yet_valid' };
  if (!Number.isInteger(claims.msl) || claims.msl <= 0) return { ok: false, code: 'no_allowance' };
  if (typeof claims.jti !== 'string' || !claims.jti) return { ok: false, code: 'malformed' };
  return { ok: true, claims };
}

// Single-use jti cache (in-memory; Render runs one instance). Entries expire at token exp.
export function createJtiCache() {
  const seen = new Map();
  return {
    use(jti, exp, nowSec = Math.floor(Date.now() / 1000)) {
      for (const [k, e] of seen) if (e < nowSec - 10) seen.delete(k);
      if (seen.has(jti)) return false;
      seen.set(jti, exp);
      return true;
    },
    size: () => seen.size,
  };
}

// Token from ?token=, Authorization: Bearer, or Sec-WebSocket-Protocol "xc-voice, <token>".
export function extractToken(req, url) {
  const q = url.searchParams.get('token');
  if (q) return q;
  const auth = req.headers['authorization'] || '';
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  const proto = String(req.headers['sec-websocket-protocol'] || '').split(',').map((s) => s.trim());
  if (proto[0] === 'xc-voice' && proto[1]) return proto[1];
  return null;
}

export function createVoiceAuthorizer(env = process.env, jtis = createJtiCache()) {
  const secret = env.VOICE_TOKEN_SECRET || '';
  const required = env.VOICE_AUTH_REQUIRED !== '0';
  return function authorize(req, url, nowSec = Math.floor(Date.now() / 1000)) {
    if (secret.length < 32) return required ? { ok: false, code: 'server_not_configured', status: 503 } : { ok: true, claims: null, unauthenticated: true };
    const v = verifyVoiceToken(secret, extractToken(req, url), nowSec);
    if (!v.ok) return required ? { ...v, status: 401 } : { ok: true, claims: null, unauthenticated: true, code: v.code };
    if (v.claims.eng && v.claims.eng !== 'doubao' && env.VOICE_ENGINE_STRICT === '1') return { ok: false, code: 'wrong_engine', status: 403 };
    if (!jtis.use(v.claims.jti, v.claims.exp, nowSec)) return { ok: false, code: 'replayed', status: 401 };
    return { ok: true, claims: v.claims };
  };
}
