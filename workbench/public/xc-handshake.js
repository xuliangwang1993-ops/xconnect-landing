// X-Connect <-> Workbench postMessage handshake (client half). No secrets here:
// tokens come from the Workbench server (POST /api/handshake) and are verified
// there (POST /api/handshake/verify). Same file is used on both sides.
//
//   XCHandshake.init({ peer: 'workbench' | 'xconnect-voice', api: 'https://xconnect-workbench-preview.onrender.com' })
//   XCHandshake.hello(targetWindow, targetOrigin) -> Promise<{ peer, origin }>
//   XCHandshake.onPeer((info) => ...)   // fires when the other side is verified
(function () {
  const ALLOWED = [
    'https://xconnect-workbench-preview.onrender.com',
    'https://xconnect-stage-preview.onrender.com',
    'https://www.x-connect.ai',
    'https://x-connect.ai',
  ];
  let cfg = { peer: '', api: '' };
  const listeners = [];
  const pending = new Map();
  const rnd = () => { const a = new Uint8Array(16); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c])); };
  const allowed = (o) => ALLOWED.includes(o) || (location.hostname === 'localhost' && o === location.origin);

  async function post(path, body) {
    const r = await fetch(cfg.api + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.code || d.error || 'HTTP ' + r.status), { data: d });
    return d;
  }
  const issue = (nonce) => post('/api/handshake', { peer: cfg.peer, nonce });
  const verify = (token, from, peer) => post('/api/handshake/verify', { token, from, peer });
  const emit = (info) => listeners.forEach((f) => { try { f(info); } catch {} });

  async function onMessage(ev) {
    const m = ev.data;
    if (!m || typeof m !== 'object' || (m.type !== 'xc-hello' && m.type !== 'xc-ack')) return;
    if (!allowed(ev.origin) || !ev.source) return;
    try {
      const v = await verify(m.token, ev.origin);
      if (m.type === 'xc-hello') {
        const mine = await issue(m.nonce);           // echo their nonce, bound to my origin
        ev.source.postMessage({ type: 'xc-ack', nonce: m.nonce, token: mine.token }, ev.origin);
        emit({ peer: v.peer, origin: ev.origin, role: 'responder' });
      } else {
        const p = pending.get(m.nonce);
        if (!p) return;
        pending.delete(m.nonce);
        // ack token must carry the nonce we generated
        if (v.nonce !== m.nonce) return p.reject(new Error('nonce_mismatch'));
        const info = { peer: v.peer, origin: ev.origin, role: 'initiator' };
        emit(info); p.resolve(info);
      }
    } catch (e) {
      if (m.type === 'xc-ack' && pending.has(m.nonce)) { pending.get(m.nonce).reject(e); pending.delete(m.nonce); }
    }
  }

  window.XCHandshake = {
    init(o) { cfg = { ...cfg, ...o }; window.removeEventListener('message', onMessage); window.addEventListener('message', onMessage); return this; },
    onPeer(f) { listeners.push(f); return this; },
    token: (nonce) => issue(nonce),
    async hello(target, targetOrigin, timeoutMs = 8000) {
      if (!allowed(targetOrigin)) throw new Error('bad_target_origin');
      const nonce = rnd();
      const mine = await issue(nonce);
      return new Promise((resolve, reject) => {
        pending.set(nonce, { resolve, reject });
        setTimeout(() => { if (pending.delete(nonce)) reject(new Error('handshake_timeout')); }, timeoutMs);
        target.postMessage({ type: 'xc-hello', nonce, token: mine.token }, targetOrigin);
      });
    },
  };
})();
