// xc-i18n.js — factory-wide language bar. Same storage key as the workbench lounge
// (xc_lang_v1) so the choice follows the user everywhere on this origin.
// Add a language: XC_I18N.addDict('ja', '日本語', { key: '…' }) — missing keys fall back to English.
(() => {
  const STORE = 'xc_lang_v1';
  const LANGS = [];
  const DICTS = {};
  const listeners = new Set();
  function addDict(code, label, dict) {
    if (!LANGS.some((l) => l.code === code)) LANGS.push({ code, label });
    DICTS[code] = { ...(DICTS[code] || {}), ...dict };
  }
  addDict('zh-Hans', '简体中文', {
    'nav.projects': '项目', 'nav.graph': '图谱', 'nav.aoi': 'AoI', 'nav.workbench': '工作台', 'nav.setting': '设置',
    'home.empty': '还没有项目', 'home.notFound': '找不到这个项目', 'home.back': '返回项目', 'home.loadFail': '项目加载失败',
    'set.title': '设置', 'set.balance': '账户与余额', 'set.model': '助手与模型', 'set.voice': '语音', 'set.assistants': '小助手设定',
    'set.build': '制作你的小助手', 'set.keys': '语音克隆 · 流式语音 API Key（自带密钥）', 'set.imgkeys': '图像生成 API Key（文生图 / 图生图，自带密钥）', 'img.hint': '小助手输入区点 🎨 生图：输入描述即文生图，拖入/上传图片即图生图。费用由你直接付给服务商，我们只提供链接；密钥加密存于服务端。', 'set.other': '其他参数', 'set.lang': '语言', 'set.skin': 'Agentic 皮肤', 'skin.auto': '跟随聊天模型（自动）', 'skin.hint': '聊天里选的模型决定界面配色；也可以手动固定。同步到工厂所有页面和其他标签页。', 'skin.now': '当前',
    'call.label': '呼叫', 'call.greet': '嗨，我是{name}！找我有什么事？', 'call.hint': '点右下角跟我聊，或去工作台开语音。',
    'lounge.mine': '我的小助手', 'lounge.make': '制作你的小助手', 'lounge.slot': '槽位 {n} · 去设置导入素材',
  });
  addDict('en', 'English', {
    'nav.projects': 'Projects', 'nav.graph': 'Graph', 'nav.aoi': 'AoI', 'nav.workbench': 'Workbench', 'nav.setting': 'Setting',
    'home.empty': 'No projects yet', 'home.notFound': 'Project not found', 'home.back': 'Back to projects', 'home.loadFail': 'Couldn’t load projects',
    'set.title': 'Setting', 'set.balance': 'Account & balance', 'set.model': 'Assistant & model', 'set.voice': 'Voice', 'set.assistants': 'Assistants',
    'set.build': 'Build your own assistant', 'set.keys': 'Voice clone · streaming voice API keys (BYOK)', 'set.imgkeys': 'Image generation API keys (text-to-image / image-to-image, BYOK)', 'img.hint': 'In the assistant composer tap 🎨 Image: type a prompt for text-to-image, or drop/upload a picture for image-to-image. You pay the provider directly; we only link to it. Keys are stored encrypted on the server.', 'set.other': 'Other', 'set.lang': 'Language', 'set.skin': 'Agentic skin', 'skin.auto': 'Follow chat model (auto)', 'skin.hint': 'The model you chat with sets the UI palette; or pin one manually. Syncs to every factory page and other tabs.', 'skin.now': 'Now',
    'call.label': 'Call', 'call.greet': 'Hi, I’m {name}! What can I do for you?', 'call.hint': 'Chat with me bottom-right, or open voice in the Workbench.',
    'lounge.mine': 'My assistants', 'lounge.make': 'Build your own assistant', 'lounge.slot': 'Slot {n} · import materials in Setting',
  });
  function detect() {
    let v = null; try { v = localStorage.getItem(STORE); } catch {}
    if (!v) { const m = document.cookie.match(/(?:^|;\s*)xc_lang_v1=([^;]+)/); v = m && decodeURIComponent(m[1]); }
    if (v && DICTS[v]) return v;
    if (v && /^zh/i.test(v)) return 'zh-Hans'; // other lounge-only languages → nearest factory dict
    const nav = (navigator.language || 'en').toLowerCase();
    if (nav.startsWith('zh')) return 'zh-Hans';
    const hit = LANGS.find((l) => nav.startsWith(l.code.toLowerCase()));
    return hit ? hit.code : 'en';
  }
  let lang = 'en';
  function t(key, vars = {}, fb) {
    const s = (DICTS[lang] && DICTS[lang][key]) || DICTS.en[key] || fb || key;
    return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  }
  function apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
    document.documentElement.lang = lang;
  }
  function setLang(code) {
    lang = DICTS[code] ? code : 'en';
    try { localStorage.setItem(STORE, lang); } catch {}
    document.cookie = `${STORE}=${encodeURIComponent(lang)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    apply(); listeners.forEach((f) => { try { f(lang); } catch {} });
    document.querySelectorAll('select.xc-lang').forEach((s) => { s.value = lang; });
  }
  function picker() {
    const s = document.createElement('select'); s.className = 'xc-lang'; s.setAttribute('aria-label', 'Language');
    s.style.cssText = 'background:transparent;border:1px solid rgba(255,255,255,.12);color:inherit;border-radius:6px;padding:4px 6px;font:12px inherit;cursor:pointer';
    for (const l of LANGS) { const o = document.createElement('option'); o.value = l.code; o.textContent = l.label; o.style.color = '#000'; s.appendChild(o); }
    s.value = lang; s.onchange = () => setLang(s.value); return s;
  }
  window.XC_I18N = { t, addDict, setLang, apply, picker, get lang() { return lang; }, onChange: (f) => listeners.add(f), langs: LANGS };
  lang = detect();
  const boot = () => {
    apply();
    const slot = document.querySelector('[data-xc-lang-slot]') || document.querySelector('header.app');
    if (slot && !slot.querySelector('select.xc-lang')) slot.appendChild(picker());
    listeners.forEach((f) => { try { f(lang); } catch {} });
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
