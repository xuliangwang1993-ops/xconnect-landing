// GraphQL client for the Linear read-only mirror.
// The key is LINEAR_API_KEY. It is never written to disk by this module.

export const LINEAR_ENDPOINT = 'https://api.linear.app/graphql';

const KEY_RE = /lin_api_[A-Za-z0-9]+/g;

export function redact(value) {
  return String(value ?? '').replace(KEY_RE, '[redacted]');
}

export function linearApiKey(env = process.env) {
  const key = String(env.LINEAR_API_KEY || '').trim();
  if (!key) {
    const err = new Error('linear_key_missing');
    err.code = 'linear_key_missing';
    throw err;
  }
  return key;
}

export function assertReadOnly(query) {
  const text = String(query || '');
  if (/\bmutation\b/i.test(text)) {
    const err = new Error('linear_write_disabled');
    err.code = 'linear_write_disabled';
    throw err;
  }
}

export async function linearGraphql(query, variables = {}, options = {}) {
  assertReadOnly(query);
  const env = options.env || process.env;
  const key = linearApiKey(env);
  const fetchImpl = options.fetchImpl || fetch;
  const endpoint = options.endpoint || LINEAR_ENDPOINT;
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: key,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (err) {
    const wrapped = new Error('linear_unreachable');
    wrapped.code = 'linear_unreachable';
    wrapped.cause = redact(err?.message || err);
    throw wrapped;
  }
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!response.ok || body?.errors) {
    const detail = body?.errors?.map((e) => e.message).filter(Boolean).join('; ');
    const err = new Error(redact(detail || `linear_http_${response.status}`));
    err.code = response.status === 401 ? 'linear_unauthorized' : 'linear_graphql';
    err.status = response.status;
    throw err;
  }
  return body?.data ?? {};
}

export async function fetchConnection(query, connectionName, options = {}) {
  const nodes = [];
  let after = null;
  for (let page = 0; page < 40; page += 1) {
    const data = await linearGraphql(query, { after }, options);
    const connection = data?.[connectionName];
    if (!connection) break;
    nodes.push(...(connection.nodes || []));
    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor || null;
    if (!after) break;
  }
  return nodes;
}
