// xc-skin.js — "Agentic skin": factory pages take on the palette of the LLM chosen in chat.
// Colors / type / radius only — no third-party logos or marks.
// State: localStorage xc_skin_v1 = { mode: 'auto'|<skin>, resolved: <skin> }, synced across tabs
// (BroadcastChannel + storage event) and to the cloud via the Workbench settings.theme field.
(() => {
  const KEY = 'xc_skin_v1';
  const SKINS = {
    default:  { label: { zh: 'X-connect 默认', en: 'X-connect default' }, bg: '#0a0a0b', panel: '#101012', text: '#ececef', mute: '#8a8f98', accent: '#5e6ad2', line: 'rgba(255,255,255,.08)', radius: '8px', font: 'Inter, ui-sans-serif, system-ui, "PingFang SC", sans-serif' },
    openai:   { label: { zh: 'ChatGPT 风格', en: 'ChatGPT-like' }, bg: '#0d1515', panel: '#12201e', text: '#ececec', mute: '#9aa7a3', accent: '#10a37f', line: 'rgba(200,240,230,.10)', radius: '12px', font: 'ui-sans-serif, system-ui, "Segoe UI", "PingFang SC", sans-serif' },
    claude:   { label: { zh: 'Claude 风格', en: 'Claude-like' }, bg: '#17130f', panel: '#211a15', text: '#f3ece4', mute: '#b3a497', accent: '#d97757', line: 'rgba(240,210,190,.13)', radius: '10px', font: '"Iowan Old Style", "Palatino Linotype", Georgia, "Songti SC", serif' },
    gemini:   { label: { zh: 'Gemini 风格', en: 'Gemini-like' }, bg: '#121022', panel: '#191631', text: '#ece9ff', mute: '#a59fce', accent: '#8b7bff', line: 'rgba(196,181,255,.14)', radius: '16px', font: '"Google Sans", ui-sans-serif, system-ui, "PingFang SC", sans-serif' },
    grok:     { label: { zh: 'Grok 风格', en: 'Grok-like' }, bg: '#000000', panel: '#101114', text: '#f5f5f5', mute: '#8b8f96', accent: '#e5e7eb', line: 'rgba(255,255,255,.12)', radius: '6px', font: 'ui-monospace, "SF Mono", Menlo, "PingFang SC", monospace' },
    deepseek: { label: { zh: 'DeepSeek 风格', en: 'DeepSeek-like' }, bg: '#0b1420', panel: '#101e2e', text: '#e8f3ff', mute: '#93a9c2', accent: '#38bdf8', line: 'rgba(165,232,255,.12)', radius: '10px', font: 'ui-sans-serif, system-ui, "PingFang SC", sans-serif' },
  };
  // Workbench model themes beyond these map to the nearest skin by accent only.
  const ALIAS = { xconnect: 'default', glm: 'gemini', qwen: 'gemini', kimi: 'claude', mimo: 'gemini', hunyuan: 'deepseek' };
  function fromModel(id) {
    const m = String(id || '').toLowerCase();
    if (/^(gpt|o\d|chatgpt|openai)/.test(m)) return 'openai';
    if (/claude|anthropic/.test(m)) return 'claude';
    if (/gemini/.test(m)) return 'gemini';
    if (/grok/.test(m)) return 'grok';
    if (/deepseek/.test(m)) return 'deepseek';
    return 'default';
  }
  const norm = (s) => (SKINS[s] ? s : SKINS[ALIAS[s]] ? ALIAS[s] : 'default');
  const css = Object.entries(SKINS).map(([id, s]) => `html[data-xc-skin="${id}"]{--bg:${s.bg};--panel:${s.panel};--text:${s.text};--mute:${s.mute};--accent:${s.accent};--line:${s.line};--xc-radius:${s.radius};--xc-font:${s.font}}`).join('\n')
    + '\nhtml[data-xc-skin]:not([data-xc-skin="default"]) body{background:var(--bg)!important;color:var(--text)!important;font-family:var(--xc-font)!important}'
    + '\nhtml[data-xc-skin]:not([data-xc-skin="default"]) section,html[data-xc-skin]:not([data-xc-skin="default"]) button,html[data-xc-skin]:not([data-xc-skin="default"]) select{border-radius:var(--xc-radius)}';
  const st = document.createElement('style'); st.id = 'xc-skin-css'; st.textContent = css; document.head.appendChild(st);
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || { mode: 'auto', resolved: 'default' }; } catch { return { mode: 'auto', resolved: 'default' }; } };
  const listeners = new Set();
  let cur = read();
  function apply(s) {
    cur = { mode: s.mode || 'auto', resolved: norm(s.resolved), model: s.model || cur.model || '' };
    // The workbench owns its own [data-theme] palette; only factory pages get data-xc-skin.
    if (!document.querySelector('meta[name="xc-skin-host"]')) document.documentElement.dataset.xcSkin = cur.resolved;
    listeners.forEach((f) => { try { f(cur); } catch {} });
  }
  let bc = null; try { bc = new BroadcastChannel('xc-skin'); bc.onmessage = (e) => e.data && apply(e.data); } catch {}
  addEventListener('storage', (e) => { if (e.key === KEY) apply(read()); });
  function set({ mode, model, resolved }) {
    const m = mode || cur.mode || 'auto';
    const r = resolved || (m === 'auto' ? fromModel(model ?? cur.model) : m);
    const s = { mode: m, resolved: norm(r), model: model ?? cur.model ?? '' };
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
    apply(s); try { bc && bc.postMessage(s); } catch {}
    return s;
  }
  window.XC_SKIN = { SKINS, fromModel, set, get: () => cur, onChange: (f) => listeners.add(f), norm };
  apply(cur);
  // Signed in: the cloud settings (theme + model) win over the local copy.
  fetch('/api/settings', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
    const s = d && d.settings; if (!s) return;
    const mode = s.theme && s.theme !== 'auto' && s.theme !== 'default' ? norm(s.theme) : 'auto';
    set({ mode, model: s.model || '' });
  }).catch(() => {});
})();
