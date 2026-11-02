// xc-nav.js — the one factory nav (5 sections: Project · Tree · AoI · Workbench · Settings; greeting/tour pop over the page). Injected on every factory page via GUIDE_TAG.
// 开始 /guide · 项目 / · 项目树(Tree/Graph) /aoi?view=tree · AoI /aoi?view=live · 工作台 /workbench/ · 设置 /settings
// Hidden (routes kept, just not linked): /portal (old Factory OS portal), /graph (old Tree|Graph page), /tree (进树 editor).
(() => {
  const p = location.pathname, v = new URLSearchParams(location.search).get('view') || '';
  if (p.startsWith('/workbench')) return; // workbench has its own top bar with the same links
  const zh = () => !window.XC_I18N || /^zh/.test(window.XC_I18N.lang);
  const S = [
    ['projects', '/', '项目', 'Project', () => p === '/' || p === '/index.html' || p.startsWith('/tree') || p.startsWith('/guide')],
    ['tree', '/aoi?view=tree', '项目树', 'Tree', () => (p.startsWith('/aoi') && v !== 'live') || p.startsWith('/graph')],
    ['aoi', '/aoi?view=live', 'AoI', 'AoI', () => p.startsWith('/aoi') && v === 'live'],
    ['workbench', '/workbench/', '工作台', 'Workbench', () => false],
    ['settings', '/settings', '设置', 'Settings', () => /^\/(settings|account|assistants)/.test(p)],
  ];
  const html = () => S.map(([id, h, z, e, on]) => `<a href="${h}" data-nav="${id}"${on() ? ' class="on" aria-current="page"' : ''}>${zh() ? z : e}</a>`).join('');
  // Top-left logo animation: rose-gold light sweep over the X-connect mark on load and hover,
  // plus a soft breathing glow. Pure CSS mask on the existing PNG; off under prefers-reduced-motion.
  function logoFx() {
    if (document.getElementById('xc-logo-fx')) return;
    const st = document.createElement('style'); st.id = 'xc-logo-fx';
    st.textContent = `.brand{position:relative;display:inline-block;isolation:isolate}
.brand::after{content:"";position:absolute;inset:0;pointer-events:none;-webkit-mask:url(/stage/brand-logo.png) left center/contain no-repeat;mask:url(/stage/brand-logo.png) left center/contain no-repeat;
background:linear-gradient(105deg,transparent 30%,rgba(255,226,214,.95) 48%,rgba(255,255,255,.9) 50%,transparent 66%) -150% 0/250% 100% no-repeat;animation:xcSweep 1.6s .3s ease-out 1 both}
.brand:hover::after{animation:xcSweep2 1.1s ease-out 1 both}
.brand img{animation:xcGlow 5s ease-in-out 2s infinite}
@keyframes xcSweep{to{background-position:150% 0}}
@keyframes xcSweep2{from{background-position:-150% 0}to{background-position:150% 0}}
@keyframes xcGlow{0%,100%{filter:drop-shadow(0 0 0 rgba(232,170,150,0))}50%{filter:drop-shadow(0 0 6px rgba(232,170,150,.45))}}
@media (prefers-reduced-motion:reduce){.brand::after,.brand:hover::after,.brand img{animation:none!important}}`;
    document.head.appendChild(st);
  }
  function mount() {
    logoFx();
    let nav = document.querySelector('header.app nav.tabs');
    if (!nav) {
      const bar = document.createElement('header');
      bar.className = 'xc-navbar';
      bar.innerHTML = '<a class="brand" href="/" aria-label="X-connect"><img src="/stage/brand-logo.png" alt="X-connect" style="height:26px;display:block"></a><nav class="tabs"></nav><span data-xc-lang-slot style="margin-left:auto"></span>';
      const st = document.createElement('style');
      st.textContent = '.xc-navbar{display:flex;align-items:center;gap:12px;padding:8px 16px;margin:0 0 8px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(10,10,11,.92);font:13px/1.4 Inter,system-ui,sans-serif;position:sticky;top:0;z-index:50}.xc-navbar nav.tabs{display:flex;gap:4px;flex-wrap:wrap}.xc-navbar nav.tabs a{padding:5px 10px;border-radius:6px;color:#8a8f98;text-decoration:none}.xc-navbar nav.tabs a.on,.xc-navbar nav.tabs a:hover{background:rgba(255,255,255,.06);color:#ececef}';
      document.head.appendChild(st);
      document.body.insertBefore(bar, document.body.firstChild);
      nav = bar.querySelector('nav.tabs');
      // Old per-page "← 返回主菜单" back links are superseded by the nav.
      document.querySelectorAll('#backHome').forEach((a) => { a.style.display = 'none'; });
    }
    nav.innerHTML = html();
    // AoI page: Tree·Graph section shows only the Tree/Graph toggle; AoI section only the live view.
    if (p.startsWith('/aoi')) document.querySelectorAll('#tabs [data-t]').forEach((b) => { b.hidden = (v === 'live') !== (b.dataset.t === 'live'); });
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', mount) : mount();
  window.XC_I18N && window.XC_I18N.onChange(() => { const n = document.querySelector('nav.tabs'); if (n) n.innerHTML = html(); });
})();
