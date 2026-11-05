/* X-Connect Factory — runtime i18n (zh source of truth -> en).
 *
 * Same approach and conventions as www.x-connect.ai/i18n.js:
 *   - runtime text swapping, no build step, source markup/data stay untouched;
 *   - same localStorage key (xc_lang_v1) and the same language codes
 *     ('zh-Hans' / 'en'), same default logic: a saved choice wins, otherwise
 *     browser language zh* -> Chinese, anything else -> English;
 *   - <html lang> is kept in sync, a CustomEvent 'xc:lang' is dispatched on change.
 * Differences, on purpose:
 *   - the Chinese text is the SOURCE: the dictionary is keyed by the exact Chinese
 *     string, so with lang=zh nothing is touched and the page is byte-identical
 *     to before;
 *   - besides exact entries there are rules (regex + function) for strings that
 *     are assembled at run time ("10/17 闭合 · 7 张未入账"), and a few structural
 *     fallbacks (split on " · ", "，", parentheses, quoted JSON strings);
 *   - anything that cannot be translated stays Chinese (graceful fallback) and is
 *     listed in XCI.misses() so coverage can be measured.
 * Extra: ?lang=zh | ?lang=en forces and saves a language.
 */
(function () {
  'use strict';

  var STORE = 'xc_lang_v1';
  var CODE = { zh: 'zh-Hans', en: 'en' };
  var CJK = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;
  var ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1 };

  var EN = Object.create(null);   // exact: zh -> en
  var KW = Object.create(null);   // recipe keyword: zh -> [en synonyms]
  var RULES = [];                 // [RegExp, function(match) -> string|null]
  var cache = Object.create(null);
  var missSet = Object.create(null);
  var lang = 'zh';
  var observer = null;
  var origText = new WeakMap();   // text node -> {zh, en}
  var origAttr = new WeakMap();   // element   -> { attr: {zh, en} }
  var origTitle = null;

  /* ---------------------------------------------------------------- core */
  function trimParts(s) {
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    return [m[1], m[2], m[3]];
  }

  function strict(core) {            // -> en string, or null if any CJK would remain
    if (!CJK.test(core)) return core;
    if (core in cache) return cache[core];
    cache[core] = null;              // recursion guard
    var r = resolve(core);
    if (r != null && CJK.test(r)) r = null;
    cache[core] = r;
    return r;
  }

  function strictKeepSpace(s) {      // strict() but keeps leading/trailing whitespace
    var p = trimParts(s);
    if (p[1] === '') return s;
    var r = strict(p[1]);
    return r == null ? null : p[0] + r + p[2];
  }

  function resolve(core) {
    var i, m, r;
    if (core in EN) return EN[core];
    for (i = 0; i < RULES.length; i++) {
      m = RULES[i][0].exec(core);
      if (m) { r = RULES[i][1](m); if (r != null) return r; }
    }
    r = trailingParen(core); if (r != null) return r;
    r = delimited(core);     if (r != null) return r;
    r = parenSegments(core); if (r != null) return r;
    r = quotedStrings(core); if (r != null) return r;
    return null;
  }

  // "head（note）" -> "head (note)"  (head may itself carry more groups)
  function trailingParen(core) {
    var m = /^([\s\S]*?)（([^（）]*)）$/.exec(core);
    if (!m || m[1].trim() === '') return null;
    var head = strict(m[1].trim()), inner = strict(m[2].trim());
    if (head == null || inner == null) return null;
    return head + ' (' + inner + ')';
  }

  var DELIMS = [
    [' · ', ' · '], [' → ', ' → '], ['；', '; '], ['。', '. '], ['，', ', '], ['、', ', '], ['：', ': ']
  ];
  // split at a delimiter occurrence so that both sides resolve (the first occurrence that works wins)
  function delimited(core) {
    var d, i, left, right, L, R, delim, j;
    if (/。$/.test(core) && core.length > 1) {          // trailing full stop
      L = strict(core.slice(0, -1)); if (L != null) return L + '.';
    }
    for (d = 0; d < DELIMS.length; d++) {
      delim = DELIMS[d][0];
      j = core.indexOf(delim);
      while (j > 0) {
        left = core.slice(0, j); right = core.slice(j + delim.length);
        if (left.trim() !== '' && right.trim() !== '') {
          L = strictKeepSpace(left); R = L == null ? null : strictKeepSpace(right);
          if (L != null && R != null) return L.replace(/\s+$/, '') + DELIMS[d][1] + R.replace(/^\s+/, '');
        }
        j = core.indexOf(delim, j + 1);
      }
    }
    return null;
  }

  // a（b）c（d）e -> a (b) c (d) e
  function parenSegments(core) {
    if (core.indexOf('（') < 0) return null;
    var segs = core.split(/（([^（）]*)）/), out = '', i, r, piece;
    for (i = 0; i < segs.length; i++) {
      if (i % 2 === 0) {
        piece = segs[i];
        if (piece.trim() === '') { out += piece; continue; }
        r = strictKeepSpace(piece);
        if (r == null) return null;
        if (out && !/\s$/.test(out) && !/^[\s,.;:)]/.test(r)) out += ' ';
        out += r;
      } else {
        r = strict(segs[i].trim());
        if (r == null) return null;
        if (out && !/\s$/.test(out)) out += ' ';
        out += '(' + r + ')';
      }
    }
    return out;
  }

  // translate every quoted string that contains CJK (JSON previews)
  function quotedStrings(core) {
    if (core.indexOf('"') < 0) return null;
    var bad = false;
    var out = core.replace(/"((?:[^"\\\n]|\\.)*)"/g, function (all, inner) {
      if (!CJK.test(inner)) return all;
      var r = strict(inner);
      if (r == null) { bad = true; return all; }
      return '"' + r.replace(/"/g, '\\"') + '"';
    });
    return bad ? null : out;
  }

  function tr(s) {                   // public: translate (only when lang is en)
    if (lang !== 'en' || typeof s !== 'string' || !CJK.test(s)) return s;
    var p = trimParts(s);
    var r = strict(p[1]);
    if (r == null) { missSet[p[1]] = 1; return s; }
    return p[0] + r + p[2];
  }

  /* ---------------------------------------------------------------- DOM */
  function skipped(node) {
    for (var n = node; n; n = n.parentNode) {
      if (n.nodeType === 1 && (SKIP_TAGS[n.nodeName] || (n.hasAttribute && n.hasAttribute('data-i18n-skip')))) return true;
    }
    return false;
  }

  function doText(n) {
    var cur = n.nodeValue, st = origText.get(n);
    if (st && cur === st.en) return;                   // our own write
    if (!cur || !CJK.test(cur) || skipped(n)) { if (st) origText.delete(n); return; }
    var en = tr(cur);
    if (en !== cur) { origText.set(n, { zh: cur, en: en }); n.nodeValue = en; }
    else if (st) origText.delete(n);
  }

  function doAttrs(el) {
    if (!el.getAttribute || skipped(el)) return;
    var rec = origAttr.get(el), i, a, v, en;
    for (i = 0; i < ATTRS.length; i++) {
      a = ATTRS[i];
      v = el.getAttribute(a);
      if (!v) continue;
      if (rec && rec[a] && rec[a].en === v) continue;
      if (!CJK.test(v)) continue;
      en = tr(v);
      if (en !== v) {
        if (!rec) { rec = {}; origAttr.set(el, rec); }
        rec[a] = { zh: v, en: en };
        el.setAttribute(a, en);
      }
    }
  }

  function walk(root, fn, efn) {
    if (root.nodeType === 3) { fn(root); return; }
    if (root.nodeType !== 1) return;
    efn(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) fn(n); else efn(n); }
  }

  function toEn(root) { walk(root, doText, doAttrs); }

  function toZh(root) {
    walk(root, function (n) {
      var st = origText.get(n);
      if (st && n.nodeValue === st.en) n.nodeValue = st.zh;
      origText.delete(n);
    }, function (el) {
      var rec = origAttr.get(el), a;
      if (!rec) return;
      for (a in rec) if (el.getAttribute(a) === rec[a].en) el.setAttribute(a, rec[a].zh);
      origAttr.delete(el);
    });
  }

  function startObserver() {
    if (observer || !window.MutationObserver) return;
    observer = new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if (r.type === 'childList') {
          for (var j = 0; j < r.addedNodes.length; j++) toEn(r.addedNodes[j]);
        } else if (r.type === 'characterData') {
          doText(r.target);
        } else if (r.type === 'attributes') {
          doAttrs(r.target);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  function stopObserver() { if (observer) { observer.disconnect(); observer = null; } }

  /* ------------------------------------------------------------ language */
  function detect() {
    var q = null, saved = null;
    try { q = new URLSearchParams(location.search).get('lang'); } catch (e) {}
    if (q) {
      q = q.toLowerCase();
      if (q.indexOf('zh') === 0 || q === 'cn') return { lang: 'zh', persist: true };
      if (q.indexOf('en') === 0) return { lang: 'en', persist: true };
    }
    try { saved = localStorage.getItem(STORE); } catch (e) {}
    if (saved) return { lang: saved === 'zh-Hans' || saved === 'zh' ? 'zh' : 'en', persist: false };
    var nav = String(navigator.language || 'en').toLowerCase();
    return { lang: nav.indexOf('zh') === 0 ? 'zh' : 'en', persist: false };
  }

  function setLang(l, persist) {
    l = l === 'en' ? 'en' : 'zh';
    var changed = l !== lang;
    lang = l;
    if (persist !== false) { try { localStorage.setItem(STORE, CODE[l]); } catch (e) {} }
    document.documentElement.lang = CODE[l];
    if (document.body) {
      document.body.setAttribute('data-lang', CODE[l]);
      if (l === 'en') { toEn(document.body); startObserver(); }
      else { stopObserver(); toZh(document.body); }
    }
    if (origTitle === null) origTitle = document.title;
    document.title = l === 'en' ? tr(origTitle) : origTitle;
    syncSwitcher();
    if (changed) document.dispatchEvent(new CustomEvent('xc:lang', { detail: { lang: CODE[l] } }));
  }

  /* ------------------------------------------------------------ switcher */
  function buildSwitcher() {
    var host = document.querySelector('.bar .right') || document.querySelector('.aoi-topbar');
    if (!host || document.getElementById('langSw')) return;
    var box = document.createElement('span');
    box.id = 'langSw';
    box.className = 'langSw';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Language');
    box.setAttribute('data-i18n-skip', '');
    [['zh', '中文'], ['en', 'EN']].forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-l', p[0]);
      b.setAttribute('lang', p[0] === 'zh' ? 'zh-Hans' : 'en');
      b.textContent = p[1];
      b.addEventListener('click', function () { setLang(p[0], true); });
      box.appendChild(b);
    });
    host.appendChild(box);
  }
  function syncSwitcher() {
    var box = document.getElementById('langSw');
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) {
      var on = b.getAttribute('data-l') === lang;
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('on', on);
    });
  }

  /* --------------------------------------------------------------- boot */
  var d0 = detect();
  lang = d0.lang;                       // known before first paint
  document.documentElement.lang = CODE[lang];
  var hideStyle = null;
  if (lang === 'en') {                  // avoid a flash of Chinese on the first paint
    hideStyle = document.createElement('style');
    hideStyle.textContent = 'html.xci-pending body{visibility:hidden}';
    document.head.appendChild(hideStyle);
    document.documentElement.classList.add('xci-pending');
  }
  function reveal() { document.documentElement.classList.remove('xci-pending'); }
  setTimeout(reveal, 3000);             // failsafe

  function boot() {
    var want = lang;
    lang = 'zh';                        // so setLang applies the initial language
    buildSwitcher();
    setLang(want, d0.persist);
    setTimeout(reveal, 0);              // after the app's own DOMContentLoaded boot
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* ----------------------------------------------------------------- API */
  window.XCI = {
    lang: function () { return lang; },
    code: function () { return CODE[lang]; },
    setLang: setLang,
    tr: tr,
    strict: strict,
    add: function (obj) { for (var k in obj) EN[k] = obj[k]; cache = Object.create(null); },
    drop: function (keys) { keys.forEach(function (k) { delete EN[k]; }); cache = Object.create(null); },
    rule: function (re, fn) { RULES.push([re, fn]); },
    addKw: function (obj) { for (var k in obj) KW[k] = obj[k]; },
    kw: function (k) { return KW[k] || []; },
    misses: function () { return Object.keys(missSet); },
    hasCjk: function (s) { return CJK.test(s); }
  };
})();
