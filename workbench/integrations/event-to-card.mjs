// Shared adapter: external events (Slack now, Linear later) -> Workbench cards.
//
// Account mapping: an external identity "<provider>:<team>:<user>" is mapped to a
// Workbench user id via env <PROVIDER>_NS_MAP (JSON). Keys tried in order:
//   "<team>:<user>", "<team>:*", "*".  Value = Workbench user id (e.g. "usr_…" or
//   "sub_…"); the namespace is nsFor(userId) so cards land in that account's
//   wb_<ns>_<card> rows.  Fallback: env <PROVIDER>_DEFAULT_USER_ID.
// Completion: register a notifier per provider; notifyCardComplete() calls the one
// matching card.source.provider with the card's stored reply context.
import crypto from 'node:crypto';

const notifiers = new Map();

export function registerNotifier(provider, fn) { notifiers.set(provider, fn); }

export function resolveUserId(provider, { team = '', user = '' } = {}, env = process.env) {
  const P = String(provider).toUpperCase();
  let map = {};
  try { map = JSON.parse(env[`${P}_NS_MAP`] || '{}') || {}; } catch { map = {}; }
  return map[`${team}:${user}`] || map[`${team}:*`] || map['*'] || env[`${P}_DEFAULT_USER_ID`] || null;
}

export function buildCard({ provider, text, title, team, user, channel, reply = null, meta = {} }, nowIso = () => new Date().toISOString()) {
  const clean = String(text || '').trim().slice(0, 20000);
  const firstLine = clean.split('\n').map((s) => s.trim()).find(Boolean) || '未命名卡片';
  const now = nowIso();
  return {
    id: 'c_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    project: '默认项目',
    title: String(title || firstLine).slice(0, 120),
    status: 'draft',
    original: clean,
    working: clean,
    source: {
      kind: 'manual',
      label: provider === 'slack' ? 'Slack' : provider,
      app: provider,
      provider,
      external: { team: team || null, user: user || null, channel: channel || null, ...meta },
      reply, // where to notify on completion (e.g. { channel, thread_ts })
      at: now,
      batch: null, index: null, externalAssistant: false,
    },
    assistant: null, review: null, approval: null, result: null,
    messages: [{ role: 'note', text: `来自 ${provider} 的卡片`, at: now }],
    createdAt: now, updatedAt: now,
  };
}

// store: { nsFor, saveCard, loadRow, cardFromRow, nowIso }
export async function createCardFromEvent(store, evt, env = process.env) {
  const userId = resolveUserId(evt.provider, evt, env);
  if (!userId) return { ok: false, code: 'no_account_mapping' };
  const session = { key: '', user: { id: userId, email: '' }, ns: store.nsFor(userId) };
  const card = await store.saveCard(session, buildCard(evt, store.nowIso));
  return { ok: true, card, ns: session.ns, userId };
}

export async function loadCardFor(store, provider, ident, cardId, env = process.env) {
  const userId = resolveUserId(provider, ident, env);
  if (!userId || !/^c_[a-z0-9]{6,32}$/i.test(cardId)) return null;
  const session = { key: '', user: { id: userId, email: '' }, ns: store.nsFor(userId) };
  const row = await store.loadRow(session, cardId);
  return row ? { session, card: store.cardFromRow(row) } : null;
}

export async function notifyCardComplete(ns, card) {
  const provider = card?.source?.provider;
  const fn = provider && notifiers.get(provider);
  if (!fn || !card.source.reply) return false;
  await fn({ ns, card, reply: card.source.reply });
  return true;
}
