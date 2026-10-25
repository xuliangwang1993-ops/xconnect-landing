/* Balance card (signed-in homepage).
 *
 * Makes the "Balance ¥… · Full access" row (#auth-quota, rendered by auth.js) a button that opens a
 * card-style dialog: relay balance, plan/access, usage, top-up history, a redeem-code form (the former
 * "Swap（兑换）" placeholder pattern: same dialog look as #soon-modal), "Top up" and "Open in app".
 *
 * Data (all through the existing Supabase session in window.__xcAuth; row-level security = own rows only):
 *   rpc entitlement          -> balance_cents, currency, mode, limits, used_today, synced_seconds_ago
 *   table usage_ledger       -> spend this month (kind <> 'balance_sync')
 *   table topup_orders       -> last 5 top-ups (amount, status, date; no provider references selected)
 * No gateway (aoi-cloud) call is made: the gateway does not accept Supabase sessions and sends no CORS
 * headers for www.x-connect.ai (see PR notes). No token is read into the DOM; only #auth-who text is reused.
 *
 * Currency: the relay balance is held in AUD (confirmed by Martin), but the wallet row / entitlement() RPC
 * still carry the default code 'CNY' and auth.js / i18n.js paint "Balance ¥…" in #auth-quota. This script
 * therefore (a) relabels everything with XC_BALANCE_CONFIG.currencyOverride ('AUD') and (b) rewrites the
 * #auth-quota text after auth.js/i18n.js paint it, WITHOUT editing auth.js.
 * Display rule (region by IP): Australia -> "A$ x.xx"; any other region -> "≈ US$ y.yy" computed from the AUD
 * figure at the single configurable constant AUD_TO_USD, with the AUD figure kept visible. Region = Cloudflare's
 * same-origin /cdn-cgi/trace "loc=" (no third party). Detection failure -> plain A$ (AUD-neutral).
 *
 * Optional config (window.XC_BALANCE_CONFIG, set before this script):
 *   currencyOverride  e.g. 'AUD' to relabel the amount (default: use the currency the data carries)
 *   audToUsd          AUD->USD display rate (default 0.7034 = xe.com mid-market, 2026-10-25 14:14 UTC, approximate, update manually; no live rate is fetched)
 *   traceUrl          region probe (default /cdn-cgi/trace)
 *   redeem            async (code) => ({ balance_cents? }) — enables the redeem form. Absent = form explains it is not live.
 *   appUrl            default https://app.x-connect.ai/#balance
 *
 * No card numbers / CVV / bank credentials are collected or stored anywhere here.
 */
(function () {
  'use strict';
  var CFG = window.XC_BALANCE_CONFIG || {};
  var APP_URL = CFG.appUrl || 'https://app.x-connect.ai/#balance';
  var SYMBOLS = { CNY: '¥', AUD: 'A$', USD: 'US$', EUR: '€', GBP: '£' };
  // Display rate 1 AUD = 0.7034 USD (xe.com mid-market 0.703415, 2026-10-25 14:14 UTC, approximate, update manually). Not a live rate: override via XC_BALANCE_CONFIG.audToUsd.
  var AUD_TO_USD = Number(CFG.audToUsd) > 0 ? Number(CFG.audToUsd) : 0.7034;
  var TRACE_URL = CFG.traceUrl || '/cdn-cgi/trace';
  var region = null;            // 'AU' | other 2-letter code | null (unknown / detection failed)
  var regionState = 'idle';     // idle | pending | done
  var LAST_FOCUS = null;
  var state = { open: false, loadId: 0, busy: false, attempts: [] };

  function $(id) { return document.getElementById(id); }
  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function client() { return window.__xcAuth || null; }

  /* ---------- formatting ---------- */
  function baseCode(cur) { return String(CFG.currencyOverride || cur || 'CNY').toUpperCase(); }
  // True when amounts held in AUD should be shown as an approximate USD value (non-Australian region only).
  function showUsd(code) { return code === 'AUD' && region && region !== 'AU' && AUD_TO_USD > 0; }
  // Returns { text, code, orig, approx }: text/code = what to show; orig = the underlying figure ("A$122.00") when converted.
  function money(cents, cur) {
    var code = baseCode(cur);
    var n = Number(cents);
    if (!isFinite(n)) return null;
    var sym = SYMBOLS[code] || '';
    var own = sym + (n / 100).toFixed(2);
    if (showUsd(code)) {
      return { text: '≈ US$' + ((n / 100) * AUD_TO_USD).toFixed(2), code: 'USD', orig: own, approx: true };
    }
    return { text: own, code: code, orig: null, approx: false };
  }
  function moneyLine(m) { return m ? (m.approx ? m.text + ' (' + m.orig + ' from the relay)' : m.text + ' ' + m.code) : '—'; }
  function detectRegion() {
    if (regionState !== 'idle') return;
    regionState = 'pending';
    var done = function (loc) {
      region = loc && /^[A-Z]{2}$/.test(loc) ? loc : null;
      regionState = 'done';
      paintQuota();
      if (state.open) rerender();
    };
    try {
      var ctl = typeof AbortController === 'function' ? new AbortController() : null;
      var tm = setTimeout(function () { if (ctl) ctl.abort(); }, 3000);
      fetch(TRACE_URL, { cache: 'no-store', credentials: 'omit', signal: ctl ? ctl.signal : undefined })
        .then(function (r) { if (!r.ok) throw new Error('trace ' + r.status); return r.text(); })
        .then(function (t) { clearTimeout(tm); var m = /^loc=([A-Za-z]{2})\s*$/m.exec(t); done(m ? m[1].toUpperCase() : null); })
        .catch(function () { clearTimeout(tm); done(null); });
    } catch (e) { done(null); }
  }

  /* ---------- the #auth-quota row (painted by auth.js / i18n.js as "Balance ¥x.xx · …") ---------- */
  var quotaObs = null;
  function paintQuota() {
    var q = $('auth-quota');
    if (!q || !CFG.currencyOverride) return;   // without an override, leave auth.js's text alone
    var txt = q.textContent || '';
    var m = /^Balance ¥(\d+(?:\.\d{2})?)([\s\S]*)$/.exec(txt);
    var cents, suffix;
    if (m) { cents = Math.round(parseFloat(m[1]) * 100); suffix = m[2]; q.dataset.xcAudCents = String(cents); q.dataset.xcSuffix = suffix; }
    else if (q.dataset.xcAudCents && /^Balance (?:A\$|≈ US\$)/.test(txt)) { cents = Number(q.dataset.xcAudCents); suffix = q.dataset.xcSuffix || ''; }
    else return;
    var mm = money(cents, CFG.currencyOverride);
    var next = 'Balance ' + mm.text + suffix;
    q.title = mm.approx ? 'Approximate US$ value. Balance held by the relay: ' + mm.orig + ' (AUD)' : 'Balance held by the relay (中转站), in AUD';
    if (next === txt) return;
    if (quotaObs) quotaObs.disconnect();
    q.textContent = next;
    observeQuota();
  }
  function observeQuota() {
    var q = $('auth-quota');
    if (!q || typeof MutationObserver !== 'function') return;
    if (!quotaObs) quotaObs = new MutationObserver(function () { paintQuota(); });
    quotaObs.observe(q, { childList: true, characterData: true, subtree: true });
  }
  function ago(sec) {
    if (sec == null) return 'never synced';
    if (sec < 90) return 'synced just now';
    if (sec < 5400) return 'synced ' + Math.round(sec / 60) + ' min ago';
    if (sec < 172800) return 'synced ' + Math.round(sec / 3600) + ' h ago';
    return 'synced ' + Math.round(sec / 86400) + ' d ago';
  }
  function day(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '—' : d.toISOString().slice(0, 10);
  }
  // Same normalisation as the gateway's redeem code (src/topup.js normalizeCode): XC-XXXX-XXXX-XXXX-XXXX, Crockford base32.
  function normalizeCode(code) {
    var s = String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (s.length === 18 && s.indexOf('XC') === 0) s = s.slice(2);
    s = s.replace(/O/g, '0').replace(/[IL]/g, '1');
    return /^[0-9A-HJKMNP-TV-Z]{16}$/.test(s) ? s : null;
  }

  /* ---------- build dialog once ---------- */
  function build() {
    if ($('xc-bal-modal')) return $('xc-bal-modal');
    var m = h('div', 'xcv-modal');
    m.id = 'xc-bal-modal';
    m.hidden = true;
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-labelledby', 'xcb-title');
    m.innerHTML =
      '<div class="xcv-card xc-bal-card">' +
      '<button type="button" class="xcb-x" id="xcb-x" aria-label="Close">&times;</button>' +
      '<h2 id="xcb-title">Your balance</h2>' +
      '<div class="xcb-vcard" aria-hidden="false">' +
        '<div class="xcb-vtop"><span class="xcb-brand">X-CONNECT</span><span class="xcb-chip" aria-hidden="true"></span></div>' +
        '<p class="xcb-label" id="xcb-label">Balance from the relay (中转站)</p>' +
        '<p class="xcb-amount" id="xcb-amount" aria-live="polite"><span class="xcb-skel" style="display:block;width:60%"></span></p>' +
        '<div class="xcb-vfoot"><span id="xcb-who"></span><span class="xcb-badge" id="xcb-mode" hidden></span></div>' +
      '</div>' +
      '<p class="xcb-note" id="xcb-note"></p>' +
      '<div class="xcb-sec" id="xcb-plan"><h3>Plan &amp; access</h3><div id="xcb-plan-b"></div></div>' +
      '<div class="xcb-sec" id="xcb-usage"><h3>Usage</h3><div id="xcb-usage-b"></div></div>' +
      '<div class="xcb-sec" id="xcb-hist"><h3>Recent top-ups</h3><div id="xcb-hist-b"></div></div>' +
      '<form class="xcb-sec" id="xcb-redeem" novalidate autocomplete="off">' +
        '<h3><label for="xcb-code">Redeem a top-up code</label></h3>' +
        '<div class="xcb-form"><input id="xcb-code" name="code" type="text" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="32" placeholder="XC-XXXX-XXXX-XXXX-XXXX" aria-describedby="xcb-rmsg">' +
        '<button type="submit" class="xcv-btn primary" id="xcb-rsubmit">Redeem</button></div>' +
        '<p class="xcb-msg" id="xcb-rmsg" role="status" aria-live="polite"></p>' +
      '</form>' +
      '<div class="xcb-foot">' +
        '<button type="button" class="xcv-btn ghost" id="xcb-refresh">Refresh</button>' +
        '<button type="button" class="xcv-btn" id="xcb-topup">Top up</button>' +
        '<a class="xcv-btn primary" id="xcb-app" target="_blank" rel="noopener noreferrer">Open in app</a>' +
      '</div></div>';
    document.body.appendChild(m);
    $('xcb-app').href = APP_URL;
    $('xcb-x').addEventListener('click', close);
    m.addEventListener('mousedown', function (e) { if (e.target === m) close(); });
    $('xcb-refresh').addEventListener('click', load);
    $('xcb-topup').addEventListener('click', function () {
      close();
      var t = $('topup');
      if (t) t.click(); else location.hash = 'topup';
    });
    $('xcb-redeem').addEventListener('submit', onRedeem);
    m.addEventListener('keydown', onKey);
    return m;
  }

  /* ---------- focus trap / Esc ---------- */
  function focusables(root) {
    return Array.prototype.filter.call(
      root.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])'),
      function (el) { return !el.disabled && !el.hidden && el.offsetParent !== null; });
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    var list = focusables($('xc-bal-modal'));
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1], a = document.activeElement;
    if (e.shiftKey && (a === first || !$('xc-bal-modal').contains(a))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (a === last || !$('xc-bal-modal').contains(a))) { e.preventDefault(); first.focus(); }
  }

  function open() {
    var m = build();
    LAST_FOCUS = document.activeElement;
    state.open = true;
    m.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    var t = $('auth-who');
    $('xcb-who').textContent = t && t.textContent && t.textContent !== '—' ? t.textContent : '';
    detectRegion();
    load();
    $('xcb-x').focus();
  }
  function close() {
    var m = $('xc-bal-modal');
    if (!m || m.hidden) return;
    m.hidden = true;
    state.open = false;
    state.loadId++;
    document.documentElement.style.overflow = '';
    if (LAST_FOCUS && LAST_FOCUS.focus && document.contains(LAST_FOCUS)) LAST_FOCUS.focus();
  }

  /* ---------- rendering ---------- */
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function row(label, value, na) {
    var r = h('div', 'xcb-row');
    r.appendChild(h('span', '', label));
    r.appendChild(h('span', na ? 'xcb-na' : '', value));
    return r;
  }
  function para(text, err) { return h('p', err ? 'xcb-err' : '', text); }
  function skeleton(el) { clear(el); el.appendChild(h('div', 'xcb-skel')); el.appendChild(h('div', 'xcb-skel')); }

  function renderBalance(ent) {
    var amt = $('xcb-amount'), mode = $('xcb-mode'), note = $('xcb-note');
    clear(amt);
    if (!ent || ent.signed_in === false) {
      amt.appendChild(h('span', 'xcb-na', 'Sign in to see your balance'));
      mode.hidden = true;
      note.textContent = 'Your session is not signed in (or has expired). Sign in again, then reopen this card.';
      return;
    }
    var m = money(ent.balance_cents, ent.currency);
    if (!m) { amt.appendChild(h('span', 'xcb-na', 'Balance unavailable')); }
    else {
      amt.appendChild(document.createTextNode(m.text));
      amt.appendChild(h('small', '', m.code));
      if (m.approx) amt.appendChild(h('span', 'xcb-orig', m.orig + ' from the relay'));
    }
    mode.hidden = false;
    mode.dataset.k = ent.mode === 'full' ? 'full' : 'partial';
    mode.textContent = ent.mode === 'full' ? 'Full access' : 'Limited access';
    var stale = typeof ent.synced_seconds_ago === 'number' && ent.synced_seconds_ago > 3600;
    var code = baseCode(ent.currency);
    var src = code === 'AUD' ? 'Balance from the relay (中转站), in AUD' : 'Balance as held by the relay (中转站), in ' + code;
    note.textContent = src + ', mirrored to your account — ' + ago(ent.synced_seconds_ago) + (stale ? '; it may be out of date. ' : '. ') +
      (m && m.approx
        ? 'US$ is an approximate display value (1 A$ ≈ US$' + AUD_TO_USD.toFixed(2) + ', indicative rate; shown because your region is not Australia). The A$ figure above is the real balance.'
        : '');
  }

  function renderPlan(ent) {
    var b = $('xcb-plan-b'); clear(b);
    if (!ent || ent.signed_in === false) { b.appendChild(row('Access', 'unknown', true)); return; }
    b.appendChild(row('Access', ent.mode === 'full' ? 'Full — chat, code samples and batch delivery' : 'Limited — top up to unlock batch delivery'));
    var cd = ent.limits && ent.limits.chat_daily;
    b.appendChild(row('Chat limit', cd == null ? 'no daily cap' : cd + ' / day'));
    b.appendChild(row('Subscription plan', 'not shown on the website yet', true));
    b.appendChild(para('Plan name and token quota live in the app (Account page); the website only knows your balance.'));
  }

  function renderUsage(ent, ledger) {
    var b = $('xcb-usage-b'); clear(b);
    if (ledger && ledger.error) {
      b.appendChild(para('Could not load usage: ' + ledger.error, true));
    } else if (!ledger || !ledger.count) {
      b.appendChild(row('Spent this month', 'not tracked yet', true));
      b.appendChild(para('Spend tracking is not switched on yet, so “nothing recorded” does not mean you spent nothing. Your balance above is the number to trust.'));
    } else {
      var cur = ent && ent.currency;
      var m = money(ledger.cents, cur);
      b.appendChild(row('Spent this month', moneyLine(m) + (ledger.capped ? ' (at least)' : '')));
      b.appendChild(row('Requests this month', String(ledger.count) + (ledger.capped ? '+' : '')));
    }
    if (ent && typeof ent.used_today === 'number') b.appendChild(row('Requests today', String(ent.used_today)));
  }

  function renderHist(ent, hist) {
    var b = $('xcb-hist-b'); clear(b);
    if (hist && hist.error) { b.appendChild(para('Could not load top-ups: ' + hist.error, true)); return; }
    if (!hist || !hist.rows.length) { b.appendChild(para('No top-ups on record yet.')); return; }
    var ul = h('ul', 'xcb-hist');
    hist.rows.forEach(function (r) {
      var li = h('li');
      var m = money(r.cents, r.currency);
      li.appendChild(h('span', '', day(r.paid_at || r.created_at) + ' · ' + (r.status || '—')));
      li.appendChild(h('span', '', moneyLine(m)));
      ul.appendChild(li);
    });
    b.appendChild(ul);
  }

  /* ---------- data ---------- */
  function monthStartIso() {
    var d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
  }
  function msgOf(e) { return (e && e.message) ? String(e.message).slice(0, 120) : 'request failed'; }

  async function fetchEnt(sb) {
    var r = await sb.rpc('entitlement');
    if (r.error) throw r.error;
    return r.data;
  }
  async function fetchUsage(sb) {
    var r = await sb.from('usage_ledger').select('cost_cents').neq('kind', 'balance_sync')
      .gte('created_at', monthStartIso()).order('created_at', { ascending: false }).limit(1000);
    if (r.error) throw r.error;
    var rows = r.data || [], sum = 0;
    rows.forEach(function (x) { sum += Number(x.cost_cents) || 0; });
    return { count: rows.length, cents: sum, capped: rows.length >= 1000 };
  }
  async function fetchHist(sb) {
    var r = await sb.from('topup_orders').select('cents,currency,status,created_at,paid_at')
      .order('created_at', { ascending: false }).limit(5);
    if (r.error) throw r.error;
    return { rows: r.data || [] };
  }

  async function load() {
    var sb = client();
    var id = ++state.loadId;
    skeleton($('xcb-plan-b')); skeleton($('xcb-usage-b')); skeleton($('xcb-hist-b'));
    var amt = $('xcb-amount'); clear(amt); amt.appendChild(h('span', 'xcb-skel')); amt.firstChild.style.cssText = 'display:block;width:60%';
    $('xcb-note').textContent = '';
    if (!sb) {
      clear(amt); amt.appendChild(h('span', 'xcb-na', 'Balance unavailable'));
      $('xcb-note').textContent = 'The account service has not loaded yet. Check your connection and press Refresh.';
      ['xcb-plan-b', 'xcb-usage-b', 'xcb-hist-b'].forEach(function (k) { clear($(k)); });
      return;
    }
    var res = await Promise.allSettled([fetchEnt(sb), fetchUsage(sb), fetchHist(sb)]);
    if (id !== state.loadId || !state.open) return; // closed / superseded
    var ent = res[0].status === 'fulfilled' ? res[0].value : null;
    if (res[0].status === 'rejected') {
      clear(amt); amt.appendChild(h('span', 'xcb-na', 'Balance unavailable'));
      $('xcb-mode').hidden = true;
      $('xcb-note').textContent = 'Could not load your balance (' + msgOf(res[0].reason) + '). Press Refresh to retry.';
      clear($('xcb-plan-b')); $('xcb-plan-b').appendChild(row('Access', 'unknown', true));
    } else {
      renderBalance(ent); renderPlan(ent);
    }
    state.last = { ent: ent, usage: res[1].status === 'fulfilled' ? res[1].value : { error: msgOf(res[1].reason) },
      hist: res[2].status === 'fulfilled' ? res[2].value : { error: msgOf(res[2].reason) } };
    renderUsage(ent, state.last.usage);
    renderHist(ent, state.last.hist);
  }
  // Re-draw from the last loaded data (region detection finished after the first paint).
  function rerender() {
    var l = state.last;
    if (!l || !l.ent) return;
    renderBalance(l.ent); renderPlan(l.ent); renderUsage(l.ent, l.usage); renderHist(l.ent, l.hist);
  }

  /* ---------- redeem form ---------- */
  function rmsg(text, kind) { var e = $('xcb-rmsg'); e.textContent = text || ''; e.dataset.kind = kind || ''; }

  async function onRedeem(ev) {
    ev.preventDefault();
    if (state.busy) return;
    var norm = normalizeCode($('xcb-code').value);
    if (!norm) return rmsg('That code does not look right. Codes look like XC-XXXX-XXXX-XXXX-XXXX.', 'err');
    var now = Date.now();
    state.attempts = state.attempts.filter(function (t) { return now - t < 60000; });
    if (state.attempts.length >= 5) return rmsg('Too many attempts. Wait a minute and try again.', 'err');
    if (typeof CFG.redeem !== 'function') {
      // Honest "not live": nothing is sent anywhere. (Gateway redeem needs a gateway session, which the website does not have yet.)
      return rmsg('Redeeming on the website is not switched on yet — nothing was sent. Use “Open in app” → Account → Redeem code.', 'err');
    }
    state.attempts.push(now);
    state.busy = true;
    var btn = $('xcb-rsubmit'); btn.disabled = true; rmsg('Redeeming…');
    try {
      await CFG.redeem('XC-' + norm.match(/.{4}/g).join('-'));
      $('xcb-code').value = '';
      rmsg('Redeemed. Refreshing your balance…', 'ok');
      await load();
    } catch (e) {
      var c = e && e.code, map = {
        already_redeemed: 'This code has already been used.',
        unknown_code: 'We could not find that code.',
        invalid_code: 'That code does not look right.'
      };
      rmsg(map[c] || ('Could not redeem: ' + msgOf(e)), 'err');
    } finally {
      state.busy = false; btn.disabled = false;
    }
  }

  /* ---------- wire the existing row ---------- */
  function wire() {
    var q = $('auth-quota');
    if (!q || q.dataset.xcBal) return;
    q.dataset.xcBal = '1';
    observeQuota();
    paintQuota();
    detectRegion();
    q.classList.add('xc-bal-trigger');
    q.setAttribute('role', 'button');
    q.setAttribute('tabindex', '0');
    q.setAttribute('aria-haspopup', 'dialog');
    q.addEventListener('click', open);
    q.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  // exposed for tests / other scripts
  window.XCBalance = { open: open, close: close, normalizeCode: normalizeCode };
})();
