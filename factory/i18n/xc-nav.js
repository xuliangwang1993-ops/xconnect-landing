// xc-nav.js — the one factory nav (6 sections). Injected on every factory page via GUIDE_TAG.
// 开始 /guide · 项目 / · Tree·Graph /aoi?view=tree · AoI /aoi?view=live · 工作台 /workbench/ · 设置 /settings
// Hidden (routes kept, just not linked): /portal (old Factory OS portal), /graph (old Tree|Graph page), /tree (进树 editor).
(() => {
  const p = location.pathname, v = new URLSearchParams(location.search).get('view') || '';
  if (p.startsWith('/workbench')) return; // workbench has its own top bar with the same links
  const zh = () => !window.XC_I18N || /^zh/.test(window.XC_I18N.lang);
  const S = [
    ['start', '/guide', '开始', 'Start', () => p.startsWith('/guide')],
    ['projects', '/', '项目', 'Projects', () => p === '/' || p === '/index.html' || p.startsWith('/tree')],
    ['treegraph', '/aoi?view=tree', 'Tree · Graph', 'Tree · Graph', () => (p.startsWith('/aoi') && v !== 'live') || p.startsWith('/graph')],
    ['aoi', '/aoi?view=live', 'AoI', 'AoI', () => p.startsWith('/aoi') && v === 'live'],
    ['workbench', '/workbench/', '工作台', 'Workbench', () => false],
    ['settings', '/settings', '⚙ 设置', '⚙ Settings', () => /^\/(settings|account|assistants)/.test(p)],
  ];
  const html = () => S.map(([id, h, z, e, on]) => `<a href="${h}" data-nav="${id}"${on() ? ' class="on" aria-current="page"' : ''}>${zh() ? z : e}</a>`).join('');
  function mount() {
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
