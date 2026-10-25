/* X-Connect · 跨子域登录（SSO cookie）
   首页 www.x-connect.ai 与 factory.x-connect.ai 是不同的源，localStorage 不互通；
   这里把会话镜像到一对域级 cookie（Domain=.x-connect.ai），另一边启动/回到前台时用 setSession 接上。
   - xc_session = access_token（原样 JWT；xc-subsite-gate Worker 的 enforce 模式读的就是它）
   - xc_refresh = refresh_token
   只在主机名属于 x-connect.ai 时生效；onrender.com 等其他域完全不动（XCSSO.enabled === false）。
   注意：cookie 不是 HttpOnly（前端 JS 必须能读），.x-connect.ai 下任何子域的脚本都读得到。
   首页与工厂页共用同一份文件，改动请两边同步。 */
(function () {
  'use strict';
  var host = location.hostname;
  var enabled = host === 'x-connect.ai' || /\.x-connect\.ai$/.test(host);
  var API = { enabled: enabled };
  window.XCSSO = API;
  if (!enabled) { API.boot = function () { return Promise.resolve(); }; API.attach = function () {}; API.signOut = function (c) { return c.auth.signOut(); }; API.clear = function () {}; return; }

  var A = 'xc_session', R = 'xc_refresh', MAXAGE = 60 * 60 * 24 * 30, LINK = 'xc-sso-linked', MAXLEN = 3800;
  var ATTR = '; Domain=.x-connect.ai; Path=/; SameSite=Lax; Secure';

  function getC(name) {
    var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch (e) { return null; }
  }
  function setC(name, val) { document.cookie = name + '=' + encodeURIComponent(val) + ATTR + '; Max-Age=' + MAXAGE; }
  function delC(name) { document.cookie = name + '=' + ATTR + '; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'; }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }

  function exp(jwt) {
    try {
      var p = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(p + '==='.slice((p.length + 3) % 4))).exp || 0;
    } catch (e) { return 0; }
  }
  function read() {
    var a = getC(A), r = getC(R);
    return a && r ? { access_token: a, refresh_token: r } : null;
  }
  function write(session) {
    if (!session || !session.access_token || !session.refresh_token) return false;
    if (session.access_token.length > MAXLEN || session.refresh_token.length > MAXLEN) return false;
    var cur = read();
    // 别用更旧的 token 覆盖另一边刚写的新 token
    if (cur && cur.refresh_token !== session.refresh_token && exp(cur.access_token) > exp(session.access_token)) return false;
    setC(A, session.access_token); setC(R, session.refresh_token);
    var ok = !!read() && read().refresh_token === session.refresh_token;
    if (ok) ls(LINK, '1');
    return ok;
  }
  function clear() { delC(A); delC(R); ls(LINK, null); }
  API.read = read; API.write = write; API.clear = clear;

  var failed = null;          // 上一次 setSession 失败的 refresh_token，别重复撞同一个
  var busy = false;
  async function adopt(client, ck) {
    try {
      var r = await client.auth.setSession({ access_token: ck.access_token, refresh_token: ck.refresh_token });
      if (r && r.error) { failed = ck.refresh_token; return false; }
      failed = null; return true;
    } catch (e) { failed = ck.refresh_token; return false; }
  }

  // 对齐「本源会话」与「域级 cookie」。任何异常都吞掉：登录卡/原有登录流程不受影响。
  async function sync(client) {
    if (busy) return; busy = true;
    try {
      var ck = read();
      var got = await client.auth.getSession(); var s = got && got.data && got.data.session;
      if (ck) {
        if (ck.refresh_token === failed) return;
        if (!s) { await adopt(client, ck); }
        else if (ck.refresh_token !== s.refresh_token && exp(ck.access_token) > (s.expires_at || exp(s.access_token))) { await adopt(client, ck); }
        else if (ck.refresh_token === s.refresh_token) ls(LINK, '1');
      } else if (s) {
        if (ls(LINK) === '1') await client.auth.signOut({ scope: 'local' });   // 另一边点了退出：cookie 没了，这边跟着退
        else write(s);                                                        // 老会话第一次镜像
      }
    } catch (e) { /* ignore */ } finally { busy = false; }
  }

  API.boot = function (client, ms) {
    return Promise.race([sync(client), new Promise(function (res) { setTimeout(res, ms || 5000); })]);
  };
  API.attach = function (client) {
    client.auth.onAuthStateChange(function (evt, session) {
      // 回调里只写 cookie，不调用 auth 方法（避免 supabase-js 内部锁死）。
      // SIGNED_OUT 不在这里清 cookie：刷新失败也会触发它，而 cookie 里可能是另一边刚刷新好的有效 token；
      // 只有用户主动退出（XCSSO.signOut）才清域级 cookie。
      if ((evt === 'SIGNED_IN' || evt === 'TOKEN_REFRESHED' || evt === 'USER_UPDATED') && session) write(session);
    });
    var tick = function () { if (!document.hidden) sync(client); };
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    setInterval(tick, 20000);
  };
  API.signOut = async function (client) { clear(); return client.auth.signOut(); };
})();
