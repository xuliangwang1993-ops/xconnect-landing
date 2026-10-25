/* 站内充值页（#topup）：收款地址 + 二维码。
 *
 * 路由切换由 portal.js 的 showRoute() 负责（显示/隐藏 #topup-page）。
 * 这里只负责：账户名输入 → 渲染收款卡片。没有任何后端调用：
 * 到账由人工对账入账，页面里也如实写明。
 *
 * 要增删收款链，只改下面的 TOPUP_ADDRESSES。address 为空 = 该链不渲染。
 * （Tron 地址尚未提供，保持为空，卡片不会出现。）
 */
(function () {
  'use strict';

  var TOPUP_ADDRESSES = [
    { id: 'ethereum', name: 'Ethereum', label: 'ERC-20', token: 'USDT',
      address: '0x20D520e47882F40498C74472471DeB7e09a7C969',
      qr: 'assets/topup/qr-ethereum.svg' },
    { id: 'polygon', name: 'Polygon', label: 'Polygon PoS · USDT on Polygon PoS', token: 'USDT',
      address: '0x20D520e47882F40498C74472471DeB7e09a7C969',
      qr: 'assets/topup/qr-polygon.svg' },
    { id: 'tron', name: 'Tron', label: 'TRC-20', token: 'USDT',
      address: '',   // 待补：所有者尚未提供 Tron 地址，留空则不显示
      qr: 'assets/topup/qr-tron.svg' }
  ];
  var KEY = 'xc_topup_account';

  function $(id) { return document.getElementById(id); }
  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function store(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function load() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }

  function copyText(text, btn) {
    function done(ok) {
      var old = btn.dataset.label || btn.textContent;
      btn.dataset.label = old;
      btn.textContent = ok ? '已复制' : '请长按地址手动复制';
      setTimeout(function () { btn.textContent = old; }, 1600);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(); });
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      done(ok);
    }
  }

  function card(c) {
    var el = h('article', 'topup-card');
    el.dataset.chain = c.id;
    el.appendChild(h('h3', null, c.name));
    el.appendChild(h('p', 'topup-net', c.label));
    el.appendChild(h('span', 'topup-tag', c.token + ' only'));
    var img = document.createElement('img');
    img.className = 'topup-qr';
    img.src = c.qr;
    img.alt = c.name + ' 收款地址二维码';
    img.width = 176; img.height = 176;
    el.appendChild(img);
    el.appendChild(h('p', 'topup-addr', c.address));
    var b = h('button', 'topup-copy', '复制地址');
    b.type = 'button';
    b.setAttribute('aria-label', '复制 ' + c.name + ' 收款地址');
    b.addEventListener('click', function () { copyText(c.address, b); });
    el.appendChild(b);
    return el;
  }

  function render(name) {
    var body = $('topup-body'), hint = $('topup-hint');
    if (!body) return;
    body.replaceChildren();
    if (!name) { body.hidden = true; if (hint) hint.hidden = false; return; }
    if (hint) hint.hidden = true;
    var chains = TOPUP_ADDRESSES.filter(function (c) { return c.address; });

    var who = h('p', 'topup-who');
    who.appendChild(document.createTextNode('入账账户名：'));
    who.appendChild(h('strong', null, name));
    body.appendChild(who);

    var cards = h('div', 'topup-cards');
    chains.forEach(function (c) { cards.appendChild(card(c)); });
    body.appendChild(cards);

    var nets = chains.map(function (c) { return c.name + '（' + c.label.split(' · ')[0] + '）'; }).join('、');
    var ul = h('ul', 'topup-notes');
    [
      ['warn', '只接受 USDT，且只接受上面列出的网络：' + nets + '。'],
      ['warn', '发送其他代币，或者选错网络，资金无法找回，我们概不负责。'],
      [null, '转账前请再核对一次网络和地址；建议先转一小笔测试，确认到账后再转大额。'],
      [null, '充值是人工入账：链上确认到账后由人工为你的账户入账，不是自动到账。'],
      [null, '请保留交易哈希（TxID），并把你的账户名和交易哈希发给客服，方便对账；没有这两项我们无法确认是哪一笔。']
    ].forEach(function (n) { ul.appendChild(h('li', n[0], n[1])); });
    body.appendChild(ul);
    body.hidden = false;
  }

  function init() {
    var input = $('topup-account');
    if (!input) return;
    var saved = load();
    if (saved) input.value = saved;
    render(input.value.trim());
    input.addEventListener('input', function () {
      var v = input.value.trim();
      store(v);
      render(v);
    });
    var back = $('topup-back');
    if (back) back.addEventListener('click', function () { location.hash = 'home'; });
    var done = $('topup-close');
    if (done) done.addEventListener('click', function () { location.hash = 'home'; });
    document.addEventListener('keydown', function (e) {
      var page = $('topup-page');
      if (e.key === 'Escape' && page && !page.hidden) location.hash = 'home';
    });

    // 「Swap / 银行卡 / 支付宝」占位入口：只弹「功能即将开放」，没有任何功能和网络请求。
    var modal = $('soon-modal');
    function closeSoon() { if (modal) modal.hidden = true; }
    document.querySelectorAll('[data-soon]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!modal) return;
        var t = $('soon-title');
        if (t) t.textContent = b.getAttribute('data-soon');
        modal.hidden = false;
        var ok = $('soon-ok');
        if (ok) ok.focus();
      });
    });
    var ok = $('soon-ok');
    if (ok) ok.addEventListener('click', closeSoon);
    if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) closeSoon(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && !modal.hidden) closeSoon();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
