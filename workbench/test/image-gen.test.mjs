import test from 'node:test';
import assert from 'node:assert/strict';
import { generateImage, pickProvider, parseDataUrl, ImageGenError, handleImageRoutes } from '../image-gen.mjs';
import { buildRequest, IMGGEN_I18N } from '../public/imggen.js';

const PNG = 'data:image/png;base64,' + Buffer.from('fakepng').toString('base64');
const fakeFetch = (calls, reply = { data: [{ b64_json: 'QUJD' }] }) => async (url, init) => {
  calls.push({ url, init });
  return { ok: true, status: 200, text: async () => JSON.stringify(reply) };
};

test('parseDataUrl accepts png and rejects junk', () => {
  assert.equal(parseDataUrl(PNG).mime, 'image/png');
  assert.equal(parseDataUrl('data:text/plain;base64,QQ=='), null);
  assert.equal(parseDataUrl('nope'), null);
});

test('user BYOK key wins over server key; i2i skips xai', () => {
  assert.equal(pickProvider({ userKeys: { openai: { key: 'u' } }, env: { ARK_API_KEY: 's' } }).source, 'user');
  assert.equal(pickProvider({ env: { ARK_API_KEY: 's' } }).id, 'ark');
  assert.equal(pickProvider({ needI2I: true, env: { XAI_API_KEY: 'x' } }), null);
  assert.equal(pickProvider({ env: { XAI_API_KEY: 'x' } }).id, 'xai');
});

test('no key -> clear no_image_provider error naming env vars', async () => {
  await assert.rejects(generateImage({ prompt: 'cat', env: {} }), (e) => e instanceof ImageGenError && e.code === 'no_image_provider' && e.status === 503 && e.extra.needed.includes('ARK_API_KEY'));
});

test('ark text-to-image and image-to-image payloads', async () => {
  const calls = [];
  const r = await generateImage({ prompt: 'cat', env: { ARK_API_KEY: 'k' }, fetchImpl: fakeFetch(calls) });
  assert.equal(r.mode, 'text-to-image'); assert.equal(r.provider, 'ark');
  assert.match(r.images[0].dataUrl, /^data:image\/png;base64,QUJD/);
  assert.match(calls[0].url, /volces\.com\/api\/v3\/images\/generations$/);
  assert.equal(JSON.parse(calls[0].init.body).image, undefined);
  const r2 = await generateImage({ prompt: 'make it blue', image: PNG, env: { ARK_API_KEY: 'k' }, fetchImpl: fakeFetch(calls) });
  assert.equal(r2.mode, 'image-to-image');
  assert.equal(JSON.parse(calls[1].init.body).image, PNG);
});

test('openai i2i uses /images/edits multipart', async () => {
  const calls = [];
  await generateImage({ prompt: 'x', image: PNG, env: { OPENAI_API_KEY: 'k' }, fetchImpl: fakeFetch(calls) });
  assert.match(calls[0].url, /\/images\/edits$/);
  assert.ok(calls[0].init.body instanceof FormData);
});

test('provider auth failure maps to provider_auth', async () => {
  const f = async () => ({ ok: false, status: 401, text: async () => '{"error":{"message":"bad key"}}' });
  await assert.rejects(generateImage({ prompt: 'x', env: { XAI_API_KEY: 'k' }, fetchImpl: f }), (e) => e.code === 'provider_auth');
});

test('route returns 503 json without keys, ignores other paths', async () => {
  let out;
  const d = { env: {}, json: (res, code, body) => { out = { code, body }; return true; }, fail: () => true, readJson: async () => ({ prompt: 'cat' }),
    loadRow: async () => null, rowData: () => null, unseal: () => null };
  assert.equal(await handleImageRoutes({ method: 'POST' }, {}, '/api/chat', {}, d), false);
  assert.equal(await handleImageRoutes({ method: 'POST' }, {}, '/api/image/generate', {}, d), true);
  assert.equal(out.code, 503); assert.equal(out.body.error, 'no_image_provider');
});

test('client request + i18n parity', () => {
  assert.deepEqual(buildRequest(' a ', null), { prompt: 'a' });
  assert.equal(buildRequest('a', PNG).image, PNG);
  assert.deepEqual(Object.keys(IMGGEN_I18N.zh).sort(), Object.keys(IMGGEN_I18N.en).sort());
});
