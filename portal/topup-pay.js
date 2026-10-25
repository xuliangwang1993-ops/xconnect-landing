/* PayPal 充值入口（和「银行卡 / 支付宝」并列）。
 *
 * 只在云闸报告 PayPal 已配置时才出现——云闸没配、没设 window.XC_TOPUP_API、请求失败，按钮都保持 hidden，
 * 页面和现在完全一样。没有任何密钥在前端：PayPal 的 client id / secret 只在云闸（aoi-cloud）的环境变量里。
 *
 * 流程：点 PayPal → 选面值 → POST {API}/v1/topup/paypal/order → 整页跳到 PayPal 批准页 →
 *       PayPal 跳回 {本站}/?topup=paypal&token=<order id>&PayerID=… →
 *       POST {API}/v1/topup/paypal/capture → 显示兑换码（delivery=code，匿名购买，到非 iOS 客户端兑换）。
 *
 * 配置（index.html 里在本脚本前面设置）：
 *   <script>window.XC_TOPUP_API = 'https://<云闸域名>';</script>   // 空 = 整个功能关闭
 * 依赖：index.html 里的 <button data-pay="paypal" hidden>（见 TOPUP-PAY.md）。样式 topup-pay.css。
 */
(function (root) {
  'use strict';

  var STR = {
    en: {
      title: 'Top up with PayPal',
      lede: 'Pick an amount. You will pay on PayPal and come back here with a redeem code.',
      credit: 'credit',
      pay: 'Pay',
      go: 'Continue to PayPal',
      cancel: 'Cancel',
      close: 'Close',
      working: 'Working…',
      redirecting: 'Taking you to PayPal…',
      capturing: 'Confirming your payment with PayPal…',
      done: 'Payment received',
      codeLabel: 'Your redeem code',
      copy: 'Copy',
      copied: 'Copied',
      redeemNote: 'Redeem it in the X-connect app on Android, Windows, macOS or the web (not on iOS): Settings → Redeem code. Keep this code safe — it can be used once.',
      pending: 'PayPal is still reviewing this payment. Your code will be available once it clears — reload this page later.',
      cancelled: 'Payment cancelled. You have not been charged.',
      error: 'Something went wrong. You have not been charged. Please try again or contact support.',
      errorCapture: 'We could not confirm this payment. If PayPal charged you, contact support with your PayPal receipt — do not pay again.',
      unavailable: 'PayPal is not available right now.'
    },
    zh: {
      title: '用 PayPal 充值',
      lede: '选择金额，在 PayPal 付款后回到这里领取兑换码。',
      credit: '入账',
      pay: '支付',
      go: '前往 PayPal 付款',
      cancel: '取消',
      close: '关闭',
      working: '处理中…',
      redirecting: '正在跳转到 PayPal…',
      capturing: '正在向 PayPal 确认付款…',
      done: '付款成功',
      codeLabel: '你的兑换码',
      copy: '复制',
      copied: '已复制',
      redeemNote: '请在安卓、Windows、macOS 客户端或网页版的「设置 → 兑换码」里兑换（iOS 不支持）。请妥善保管，兑换码只能使用一次。',
      pending: 'PayPal 还在审核这笔付款，通过后才会出码，请稍后刷新本页。',
      cancelled: '已取消付款，没有扣款。',
      error: '出错了，没有扣款。请重试或联系客服。',
      errorCapture: '无法确认这笔付款。如果 PayPal 已扣款，请带上 PayPal 收据联系客服，不要重复支付。',
      unavailable: '暂时无法使用 PayPal。'
    }
  };

  function lang() {
    var l = (root.document && root.document.documentElement && root.document.documentElement.lang) || '';
    return /^zh/i.test(l) ? 'zh' : 'en';
  }
  function t(key) { return (STR[lang()] || STR.en)[key] || STR.en[key] || key; }

  // —— 纯函数（node 测试覆盖）——
  function apiBase(w) {
    var v = w && typeof w.XC_TOPUP_API === 'string' ? w.XC_TOPUP_API.trim().replace(/\/+$/, '') : '';
    return /^https:\/\//.test(v) || /^http:\/\/localhost(:\d+)?$/.test(v) ? v : '';
  }
  function paypalEnabled(cards) {
    return !!(cards && cards.payment_providers && cards.payment_providers.paypal && cards.payment_providers.paypal.enabled === true &&
      Array.isArray(cards.cards) && cards.cards.length > 0);
  }
  // 回跳参数：?topup=paypal&token=<order id>&PayerID=… ；token 必须像 PayPal 订单号。
  function parseReturn(search) {
    var p = new URLSearchParams(search || '');
    if (p.get('topup') !== 'paypal') return null;
    var token = p.get('token') || '';
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) return { error: 'bad_token' };
    return { orderId: token };
  }
  function money(cents) { return '$' + (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2); }

  // —— 网络 ——
  function req(base, path, opts) {
    return root.fetch(base + path, opts).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (body) { return { status: res.status, body: body }; });
    });
  }
  function postJson(base, path, body) {
    return req(base, path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  }

  // —— UI ——
  var doc = root.document;
  function el(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  var overlay = null;
  function closeOverlay() { if (overlay) { overlay.remove(); overlay = null; } }
  function openOverlay(title) {
    closeOverlay();
    overlay = el('div', 'xcpay-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    var card = el('div', 'xcpay-card');
    var h = el('h3', 'xcpay-title', title);
    h.tabIndex = -1;
    card.appendChild(h);
    overlay.appendChild(card);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeOverlay(); });
    doc.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { closeOverlay(); doc.removeEventListener('keydown', onKey); }
    });
    doc.body.appendChild(overlay);
    h.focus();
    return card;
  }
  function note(card, text, cls) {
    var p = el('p', cls || 'xcpay-note', text);
    card.appendChild(p);
    return p;
  }
  function closeButton(card, label) {
    var b = el('button', 'xcpay-btn xcpay-ghost', label || t('close'));
    b.type = 'button';
    b.addEventListener('click', closeOverlay);
    card.appendChild(b);
  }

  function showPicker(base, cards) {
    var card = openOverlay(t('title'));
    note(card, t('lede'));
    var list = el('div', 'xcpay-amounts');
    var chosen = null;
    var go = el('button', 'xcpay-btn xcpay-go', t('go'));
    go.type = 'button';
    go.disabled = true;
    var msg = el('p', 'xcpay-msg');
    msg.setAttribute('role', 'status');
    cards.cards.forEach(function (c) {
      var b = el('button', 'xcpay-amount');
      b.type = 'button';
      b.appendChild(el('strong', null, money(c.charge_cents)));
      b.appendChild(el('span', null, t('credit') + ' ' + money(c.credit_cents)));
      b.addEventListener('click', function () {
        chosen = c.card_cents;
        Array.prototype.forEach.call(list.children, function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
        go.disabled = false;
      });
      list.appendChild(b);
    });
    card.appendChild(list);
    card.appendChild(msg);
    var row = el('div', 'xcpay-row');
    go.addEventListener('click', function () {
      if (!chosen) return;
      go.disabled = true;
      msg.textContent = t('working');
      postJson(base, '/v1/topup/paypal/order', { card_cents: chosen, delivery: 'code' }).then(function (r) {
        if (r.status === 200 && r.body && typeof r.body.url === 'string' && /^https:\/\/([a-z0-9-]+\.)*paypal\.com\//.test(r.body.url)) {
          msg.textContent = t('redirecting');
          root.location.assign(r.body.url);
        } else {
          msg.textContent = r.status === 501 ? t('unavailable') : t('error');
          go.disabled = false;
        }
      }).catch(function () { msg.textContent = t('error'); go.disabled = false; });
    });
    row.appendChild(go);
    var cancel = el('button', 'xcpay-btn xcpay-ghost', t('cancel'));
    cancel.type = 'button';
    cancel.addEventListener('click', closeOverlay);
    row.appendChild(cancel);
    card.appendChild(row);
  }

  function showResult(base, orderId) {
    var card = openOverlay(t('capturing'));
    var title = card.firstChild;
    function fail(text) { title.textContent = t('error'); note(card, text, 'xcpay-note xcpay-bad'); closeButton(card); }
    postJson(base, '/v1/topup/paypal/capture', { order_id: orderId }).then(function (r) {
      if (r.status === 202) { title.textContent = t('title'); note(card, t('pending')); closeButton(card); return; }
      if (r.status === 200 && r.body && r.body.ok) {
        title.textContent = t('done');
        if (r.body.code) {
          note(card, t('codeLabel'));
          var code = el('p', 'xcpay-code', r.body.code);
          card.appendChild(code);
          var cp = el('button', 'xcpay-btn xcpay-go', t('copy'));
          cp.type = 'button';
          cp.addEventListener('click', function () {
            var done = function () { cp.textContent = t('copied'); };
            if (root.navigator && root.navigator.clipboard) root.navigator.clipboard.writeText(r.body.code).then(done, done);
          });
          card.appendChild(cp);
          note(card, t('redeemNote'));
        }
        closeButton(card);
        return;
      }
      fail(t('errorCapture'));
    }).catch(function () { fail(t('errorCapture')); });
  }

  function init() {
    var base = apiBase(root);
    if (!base || !doc) return; // 没配置：保持隐藏，页面与以前完全一样
    var ret = parseReturn(root.location.search);
    if (ret) {
      // 清掉地址栏里的 token，防止刷新重复 capture（服务端本来也幂等）
      try { root.history.replaceState(null, '', root.location.pathname + (root.location.hash || '')); } catch (e) { /* ignore */ }
      if (ret.error) { var c = openOverlay(t('error')); closeButton(c); } else { showResult(base, ret.orderId); }
    } else if (/(^|&)topup=paypal_cancel/.test(root.location.search.slice(1))) {
      try { root.history.replaceState(null, '', root.location.pathname + (root.location.hash || '')); } catch (e) { /* ignore */ }
      var cc = openOverlay(t('cancelled'));
      closeButton(cc);
    }
    var buttons = doc.querySelectorAll('[data-pay="paypal"]');
    if (!buttons.length) return;
    req(base, '/v1/topup/cards', { method: 'GET' }).then(function (r) {
      if (r.status !== 200 || !paypalEnabled(r.body)) return; // 未配置 / 出错：继续隐藏
      Array.prototype.forEach.call(doc.querySelectorAll('[data-pay-sep]'), function (s) { s.hidden = false; });
      Array.prototype.forEach.call(buttons, function (b) {
        b.hidden = false;
        b.addEventListener('click', function () { showPicker(base, r.body); });
      });
    }).catch(function () { /* 网络错误：保持隐藏 */ });
  }

  var api = { apiBase: apiBase, paypalEnabled: paypalEnabled, parseReturn: parseReturn, money: money, STR: STR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.XCTopupPay = api;
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
