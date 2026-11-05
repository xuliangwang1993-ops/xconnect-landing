/* X-Connect Factory · 登录门
   与首页同一个 Supabase 项目（elecldbgysdbymkyucwf）。工厂页在另一个源（onrender.com），
   首页的 localStorage 会话带不过来，所以这里自己登录：邮箱+密码 / 邮件验证码。
   只用公开的 anon(publishable) key；页面里永远不放 service-role。 */
(() => {
  'use strict';
  const SUPABASE_URL = 'https://elecldbgysdbymkyucwf.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_gxvVk-D31VRFKkRtoRwzCw_2Bql3_Fg';
  const $ = (s) => document.querySelector(s);
  const lib = window.supabase;
  if (!lib || !lib.createClient) { document.documentElement.setAttribute('data-auth-err', 'supabase-js missing'); return; }

  const client = lib.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'xcf-auth-v1', flowType: 'implicit' },
  });
  const XCI = window.XCI || { tr: (s) => s };
  const tr = (s) => XCI.tr(s);

  const ERR = [
    [/invalid login credentials/i, '邮箱或密码不对'],
    [/email not confirmed/i, '邮箱还没验证，请先到邮件里确认'],
    [/rate limit|too many|security purposes/i, '请求太频繁，请稍后再试'],
    [/signups? not allowed|user not found/i, '这个邮箱还没有账号，请先到首页注册'],
    [/token has expired|invalid.*(token|otp)|otp.*(expired|invalid)/i, '验证码不对或已过期'],
    [/failed to fetch|network/i, '网络不通，请稍后再试'],
  ];
  const zhErr = (e) => { const m = (e && e.message) || ''; const hit = ERR.find(([re]) => re.test(m)); return hit ? hit[1] : '登录失败，请稍后再试'; };

  let msgZh = '';
  function say(zh, kind) {
    const el = $('#gateMsg'); if (!el) return;
    msgZh = zh || '';
    el.textContent = tr(msgZh);
    el.dataset.kind = kind || '';
  }
  document.addEventListener('xc:lang', () => { const el = $('#gateMsg'); if (el && msgZh) el.textContent = tr(msgZh); });
  const busy = (b, on) => { if (b) { b.disabled = !!on; } };

  let current = null;
  function render(session) {
    current = session || null;
    const user = current && current.user;
    document.body.dataset.auth = user ? 'in' : 'out';
    const gate = $('#authGate'); if (gate) gate.hidden = !!user;
    const who = $('#whoPill'), out = $('#signOutBtn');
    if (who) { who.hidden = !user; who.textContent = user ? (user.email || '已登录') : ''; }
    if (out) out.hidden = !user;
    const mobileWho = $('#mobileWho'), mobileOut = $('#mobileSignOutBtn');
    if (mobileWho) { mobileWho.hidden = !user; mobileWho.textContent = user ? (user.email || '已登录') : ''; }
    if (mobileOut) mobileOut.hidden = !user;
    document.dispatchEvent(new CustomEvent('xcf:session', { detail: { session: current } }));
  }

  // 登录方式切换
  document.querySelectorAll('.gTab').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.gTab').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); });
    document.querySelectorAll('.gForm').forEach((f) => f.classList.toggle('on', f.dataset.g === b.dataset.g));
    say('');
  }));

  $('#formPw') && $('#formPw').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#pwBtn'); busy(btn, true); say('登录中…');
    const { error } = await client.auth.signInWithPassword({ email: $('#pwEmail').value.trim(), password: $('#pwPass').value });
    busy(btn, false);
    if (error) say(zhErr(error), 'bad'); else { say(''); $('#pwPass').value = ''; }
  });

  $('#formOtp') && $('#formOtp').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#otpSend'); busy(btn, true); say('发送中…');
    const { error } = await client.auth.signInWithOtp({
      email: $('#otpEmail').value.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname },
    });
    busy(btn, false);
    if (error) { say(zhErr(error), 'bad'); return; }
    $('#otpCodeRow').hidden = false; $('#otpVerify').hidden = false;
    say('已发送。点邮件里的链接，或在下面输入邮件里的验证码。', 'ok');
    $('#otpCode').focus();
  });
  $('#otpVerify') && $('#otpVerify').addEventListener('click', async () => {
    const btn = $('#otpVerify'); busy(btn, true); say('验证中…');
    const { error } = await client.auth.verifyOtp({ email: $('#otpEmail').value.trim(), token: $('#otpCode').value.trim(), type: 'email' });
    busy(btn, false);
    if (error) say(zhErr(error), 'bad'); else say('');
  });

  $('#mobileSignOutBtn') && $('#mobileSignOutBtn').addEventListener('click', () => $('#signOutBtn').click());
  $('#signOutBtn') && $('#signOutBtn').addEventListener('click', async () => {
    if (window.XCSSO) await window.XCSSO.signOut(client); else await client.auth.signOut();   // x-connect.ai 下同时清域级 cookie
    render(null);
  });

  client.auth.onAuthStateChange((evt, session) => {
    if (evt === "INITIAL_SESSION") return;          // 初始态由下面的 getSession 统一处理
    if ((evt === 'TOKEN_REFRESHED' || evt === 'SIGNED_IN' || evt === 'USER_UPDATED') && current && session && current.user.id === session.user.id) { current = session; return; }
    render(session);
  });

  window.XCAuth = { client, session: () => current };
  // 跨子域登录（仅 *.x-connect.ai 生效；onrender.com 上 XCSSO.enabled=false，行为与之前完全一致）
  const SSO = window.XCSSO;
  if (SSO && SSO.enabled) SSO.attach(client);
  const ready = SSO && SSO.enabled ? SSO.boot(client).catch(() => {}) : Promise.resolve();
  ready.then(() => client.auth.getSession()).then(({ data }) => render(data && data.session)).catch(() => render(null));
})();
