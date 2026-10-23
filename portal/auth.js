// X-connect · account access
// 密碼 / GitHub / Google / Apple / Passkey 走 Supabase Auth；微信暫無原生 provider。
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://elecldbgysdbymkyucwf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gxvVk-D31VRFKkRtoRwzCw_2Bql3_Fg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    experimental: { passkey: true },
  },
});

const $ = (s) => document.querySelector(s);
const authBox = $('#auth');
const loginBody = $('.auth-body[data-auth="out"]');
const signedBody = $('.auth-body[data-auth="in"]');
const authMsg = $('#auth-msg');
const signupMsg = $('#signup-msg');

let msgTimer = 0;
function say(el, text, kind) {
  if (!el) return;
  el.textContent = text || '';
  el.dataset.kind = kind || '';
  clearTimeout(msgTimer);
  if (text) msgTimer = setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 7000);
}

const PROVIDER_LABEL = { wechat: 'WeChat', github: 'GitHub', google: 'Google', apple: 'Apple' };

function busy(btn, on) {
  if (!btn) return;
  btn.disabled = !!on;
  btn.dataset.busy = on ? '1' : '';
}

/* ---------- 状态渲染 ---------- */
function render(session) {
  const user = session?.user || null;
  const signedIn = !!user;
  document.body.dataset.auth = signedIn ? 'in' : 'out';
  if (loginBody) loginBody.hidden = signedIn;
  if (signedBody) signedBody.hidden = !signedIn;
  if ($('#auth-who')) $('#auth-who').textContent = user?.email || user?.phone || 'this device';
  document.querySelectorAll('.entry').forEach((el) => {
    el.classList.toggle('is-locked', !signedIn);
    el.setAttribute('aria-disabled', String(!signedIn));
  });
  const s = $('#session');
  if (s) {
    s.textContent = signedIn ? (user?.email || 'Signed in') : 'Sign in';
    s.setAttribute('aria-pressed', String(signedIn));
  }
  if (signedIn) refreshEntitlement();
  else {
    document.body.dataset.quota = '';
    const q = $('#auth-quota');
    if (q) { q.textContent = ''; q.dataset.mode = ''; }
  }
  document.dispatchEvent(new CustomEvent('xc:auth', { detail: { signedIn, user } }));
}

/* ---------- 额度 ---------- */
async function refreshEntitlement() {
  const { data, error } = await supabase.rpc('entitlement');
  if (error || !data) return;
  window.__xcEntitlement = data;
  document.body.dataset.quota = data.mode || '';
  const el = $('#auth-quota');
  if (el) {
    const yuan = (Number(data.balance_cents || 0) / 100).toFixed(2);
    el.dataset.mode = data.mode || '';
    el.textContent =
      data.mode === 'full'
        ? 'Balance ¥' + yuan + ' · Full access'
        : 'Balance ¥' + yuan + ' · Limited access — top up to unlock batch delivery';
  }
  const t = $('#topup');
  if (t && data.topup_url) t.href = data.topup_url;
  document.dispatchEvent(new CustomEvent('xc:entitlement', { detail: data }));
}

/* ---------- 登录 ---------- */
$('#login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;
  if (!email || !password) return say(authMsg, 'Enter your email and password.', 'err');
  const btn = e.submitter || $('#login-form .auth-submit');
  busy(btn, true);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  busy(btn, false);
  if (error) return say(authMsg, error.message, 'err');
  $('#login-password').value = '';
  say(authMsg, 'Signed in.', 'ok');
});

/* ---------- 注册 ---------- */
$('#signup-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#signup-email').value.trim();
  const password = $('#signup-password').value;
  const password2 = $('#signup-password2').value;
  if (!email) return say(signupMsg, 'Enter your email.', 'err');
  if (password.length < 8) return say(signupMsg, 'Password needs at least 8 characters.', 'err');
  if (password !== password2) return say(signupMsg, 'Passwords do not match.', 'err');
  if (!$('#signup-terms').checked) return say(signupMsg, 'Please accept the terms first.', 'err');
  const btn = e.submitter || $('#signup-form .auth-submit');
  busy(btn, true);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  busy(btn, false);
  if (error) return say(signupMsg, error.message, 'err');
  if (data.session) {
    say(signupMsg, 'Account created. You are signed in.', 'ok');
  } else {
    say(signupMsg, 'Check your inbox to confirm the address, then sign in.', 'ok');
    $('#signup-form').reset();
  }
});

/* ---------- 第三方 / Passkey ---------- */
document.querySelectorAll('[data-oauth]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const provider = btn.dataset.oauth;
    const target = authMsg;
    if (provider === 'wechat') {
      return say(target, 'WeChat sign-in needs a WeChat Open Platform app ID — not wired up yet.', 'err');
    }
    busy(btn, true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: location.origin + location.pathname },
    });
    busy(btn, false);
    if (error) say(target, PROVIDER_LABEL[provider] + ': ' + error.message, 'err');
  });
});

$('#passkey-signin')?.addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  busy(btn, true);
  try {
    const { error } = await supabase.auth.signInWithPasskey();
    if (error) say(authMsg, error.message, 'err');
  } catch (err) {
    say(authMsg, 'This browser could not run the passkey prompt.', 'err');
  }
  busy(btn, false);
});

$('#add-passkey')?.addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  busy(btn, true);
  try {
    const { data, error } = await supabase.auth.registerPasskey();
    if (error) say(authMsg, error.message, 'err');
    else say(authMsg, 'Passkey added: ' + (data?.friendly_name || 'this device'), 'ok');
  } catch (err) {
    say(authMsg, 'Passkey registration was cancelled.', 'err');
  }
  busy(btn, false);
});

$('#signout')?.addEventListener('click', async () => {
  await supabase.auth.signOut();
  say(authMsg, 'Signed out.', 'ok');
});

/* ---------- 辅助入口 ---------- */
$('#go-signup')?.addEventListener('click', () => {
  document.getElementById('signup')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => $('#signup-email')?.focus({ preventScroll: true }), 520);
});

$('#forgot')?.addEventListener('click', async () => {
  const email = $('#login-email').value.trim();
  if (!email) return say(authMsg, 'Type your email above first.', 'err');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + location.pathname,
  });
  say(authMsg, error ? error.message : 'Reset link sent to ' + email + '.', error ? 'err' : 'ok');
});

// 顶部 Session 按钮：去掉旧演示逻辑，改为聚焦登录卡 / 打开注册区
const sessionBtn = $('#session');
if (sessionBtn) {
  const fresh = sessionBtn.cloneNode(true);
  sessionBtn.replaceWith(fresh);
  fresh.addEventListener('click', () => {
    if (document.body.dataset.auth === 'in') {
      document.getElementById('signup')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      authBox?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      $('#login-email')?.focus({ preventScroll: true });
    }
  });
}

/* ---------- 未登录点左右入口 ---------- */
document.addEventListener('xc:needs-auth', () => {
  if (!authBox) return;
  authBox.classList.remove('shake');
  void authBox.offsetWidth;
  authBox.classList.add('shake');
  say(authMsg, 'Sign in first — both doors unlock with one account.', 'err');
  $('#login-email')?.focus({ preventScroll: true });
});

/* ---------- 会话 ---------- */
supabase.auth.getSession().then(({ data }) => render(data.session));
supabase.auth.onAuthStateChange((_event, session) => render(session));

window.__xcAuth = supabase;
