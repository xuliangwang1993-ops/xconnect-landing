/* 只显示 Supabase 真正启用的第三方登录。
 *
 * 之前四个图标（微信/GitHub/Google/Apple）是写死的，但 Supabase 里只有
 * GitHub 开了，点 Google/Apple 会直接跳到
 *   {"code":400,"error_code":"validation_failed","msg":"Unsupported provider"}
 * 这里读 /auth/v1/settings 的 external 字段，把没开的按钮收起来；
 * 你以后在 Supabase 开了 Google，按钮会自己出现，不用再改代码。
 */
(function () {
  'use strict';

  function waitForClient(cb) {
    var tries = 0;
    (function poll() {
      if (window.__xcAuth) return cb(window.__xcAuth);
      if (++tries > 80) return;
      setTimeout(poll, 100);
    })();
  }

  function hideUnsupported(external) {
    var buttons = document.querySelectorAll('[data-oauth]');
    if (!buttons.length) return;
    var shown = 0;
    buttons.forEach(function (btn) {
      var provider = btn.getAttribute('data-oauth');
      var on = external[provider] === true;
      btn.hidden = !on;
      btn.style.display = on ? '' : 'none';
      if (on) shown++;
    });

    // 一个都没有时，把「or continue with」这行也收掉
    if (!shown) {
      document.querySelectorAll('.social-row, .oauth-row').forEach(function (row) {
        row.hidden = true;
        row.style.display = 'none';
      });
      document.querySelectorAll('.auth-divider, .or-divider').forEach(function (d) {
        d.hidden = true;
        d.style.display = 'none';
      });
    }
  }

  function alsoGateClicks(external) {
    // 兜底：万一样式被覆盖，点没开的 provider 也别弹 JSON
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-oauth]');
      if (!btn) return;
      var provider = btn.getAttribute('data-oauth');
      if (external[provider] === true) return;
      e.preventDefault();
      e.stopPropagation();
      var msg = document.getElementById('auth-msg') || document.getElementById('signup-msg');
      if (msg) {
        msg.textContent = '这个登录方式还没开通。';
        msg.dataset.kind = 'err';
      }
    }, true);
  }

  function boot() {
    waitForClient(function (sb) {
      var base = (sb.supabaseUrl || '').replace(/\/+$/, '');
      var key = sb.supabaseKey || '';
      if (!base) return;
      fetch(base + '/auth/v1/settings', { headers: { apikey: key } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (cfg) {
          if (!cfg || !cfg.external) return;   // 读不到就保持原样，不误伤
          hideUnsupported(cfg.external);
          alsoGateClicks(cfg.external);
        })
        .catch(function () { /* 网络问题：保持原样 */ });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
