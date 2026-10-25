/* 充值前的邮箱验证闸门。
 *
 * 规则：注册即可用（Supabase mailer_autoconfirm=true），但点「Top up」前必须
 * 完成一次 OTP 回环，证明这个邮箱是他的。验证结果写进
 * public.email_verifications（只允许 mark_email_verified() 这个 SECURITY
 * DEFINER 函数写入，JWT 里的 email 必须与账号一致）。
 *
 * 自包含：不依赖 auth.js 的内部函数，只用 window.__xcAuth（它已经挂在全局）。
 */
(function () {
  'use strict';

  var MODAL = 'verify-modal';

  function $(sel) { return document.querySelector(sel); }
  function el(id) { return document.getElementById(id); }

  function msg(text, kind) {
    var box = el('verify-msg');
    if (!box) return;
    box.textContent = text || '';
    box.dataset.kind = kind || '';
  }

  function client() { return window.__xcAuth || null; }

  function show() {
    var m = el(MODAL);
    if (m) m.hidden = false;
  }

  function hide() {
    var m = el(MODAL);
    if (m) m.hidden = true;
    msg('');
  }

  async function alreadyVerified(supabase, userId) {
    try {
      var res = await supabase
        .from('email_verifications')
        .select('verified_at')
        .eq('user_id', userId)
        .maybeSingle();
      return !res.error && !!res.data;
    } catch (e) {
      return false;
    }
  }

  // Google/GitHub 等 OAuth 登录时，邮箱归属已由对方 provider 证明过，
  // 不必再发一次 OTP。只有邮箱+密码注册的用户才需要补验证。
  function isOAuthSession(session) {
    var u = session && session.user;
    if (!u) return false;
    var meta = u.app_metadata || {};
    var provider = meta.provider ||
      (Array.isArray(u.identities) && u.identities[0] && u.identities[0].provider) ||
      'email';
    return provider !== 'email' && provider !== 'phone';
  }

  async function startTopUp() {
    var supabase = client();
    if (!supabase) return;

    var session = (await supabase.auth.getSession()).data.session;
    if (!session) {
      msg('请先登录。', 'err');
      return;
    }
    if (isOAuthSession(session) || await alreadyVerified(supabase, session.user.id)) {
      if (isOAuthSession(session)) {
        // 顺手记录，失败不影响放行（只用于后续查询）。
        Promise.resolve(supabase.rpc('mark_email_verified')).catch(function () {});
      }
      location.hash = 'topup';
      return;
    }

    var input = el('verify-email');
    if (input) input.value = session.user.email || '';
    el('verify-code-wrap').hidden = true;
    el('verify-submit').hidden = true;
    el('verify-send').hidden = false;
    el('verify-send').disabled = false;
    msg('为了防刷单，充值前需要验证一次邮箱。');
    show();
  }

  async function sendCode() {
    var supabase = client();
    var email = (el('verify-email') || {}).value || '';
    if (!supabase || !email) return;
    el('verify-send').disabled = true;
    msg('正在发送…');
    var res = await supabase.auth.signInWithOtp({
      email: email,
      options: { shouldCreateUser: false }
    });
    el('verify-send').disabled = false;
    if (res.error) {
      msg(res.error.message, 'err');
      return;
    }
    el('verify-code-wrap').hidden = false;
    el('verify-submit').hidden = false;
    el('verify-send').hidden = true;
    msg('验证码已发出，请查收邮件。', 'ok');
    el('verify-code') && el('verify-code').focus();
  }

  async function submitCode() {
    var supabase = client();
    var email = (el('verify-email') || {}).value || '';
    var token = ((el('verify-code') || {}).value || '').trim();
    if (!supabase || !token) {
      msg('请输入验证码。', 'err');
      return;
    }
    el('verify-submit').disabled = true;
    msg('正在校验…');
    var res = await supabase.auth.verifyOtp({ email: email, token: token, type: 'email' });
    if (res.error) {
      el('verify-submit').disabled = false;
      msg(res.error.message, 'err');
      return;
    }
    var mark = await supabase.rpc('mark_email_verified');
    el('verify-submit').disabled = false;
    if (mark.error) {
      msg('验证码正确，但记录失败：' + mark.error.message, 'err');
      return;
    }
    msg('邮箱已验证，正在打开充值页…', 'ok');
    setTimeout(function () { hide(); location.hash = 'topup'; }, 600);
  }

  function wire() {
    var btn = document.getElementById('topup');
    if (btn && !btn.dataset.gateWired) {
      btn.dataset.gateWired = '1';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        startTopUp();
      });
    }
    var send = el('verify-send');
    if (send && !send.dataset.wired) {
      send.dataset.wired = '1';
      send.addEventListener('click', sendCode);
    }
    var sub = el('verify-submit');
    if (sub && !sub.dataset.wired) {
      sub.dataset.wired = '1';
      sub.addEventListener('click', submitCode);
    }
    var cancel = el('verify-cancel');
    if (cancel && !cancel.dataset.wired) {
      cancel.dataset.wired = '1';
      cancel.addEventListener('click', hide);
    }
    var modal = el(MODAL);
    if (modal && !modal.dataset.wired) {
      modal.dataset.wired = '1';
      modal.addEventListener('click', function (e) { if (e.target === modal) hide(); });
    }
  }

  function boot() {
    // auth.js 是 module，执行晚于本脚本；等它把 window.__xcAuth 挂上再接线。
    var tries = 0;
    (function wait() {
      if (window.__xcAuth) { wire(); return; }
      if (++tries > 60) return;
      setTimeout(wait, 100);
    })();
    // #topup 在登录后才出现，用 MutationObserver 补一次接线
    var host = document.getElementById('auth');
    if (host) {
      new MutationObserver(function () { wire(); }).observe(host, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
