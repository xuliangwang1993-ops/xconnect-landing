// 图像生成 in the assistant composer: toggle 🎨 mode, drag-drop/upload a reference
// image (image-to-image) or just type a prompt (text-to-image). POST /api/image/generate.
export const IMGGEN_I18N = {
  zh: { toggle: '生图', toggleTitle: '图像生成模式：文生图 / 图生图', attach: '添加参考图', drop: '松手即可作为参考图（图生图）', on: '图像生成模式已开：输入描述，可拖入参考图', ph: '描述你想要的画面…（拖入图片则为图生图）', gen: '生成图像', t2i: '文生图', i2i: '图生图', working: '正在生成图像…', done: '已生成', dl: '下载', fail: '生成失败', need: '请先输入描述', bad: '只支持 PNG/JPEG/WebP，最大 8MB', remove: '移除', keyHint: '去 Setting 添加图像 API Key' },
  en: { toggle: 'Image', toggleTitle: 'Image mode: text-to-image / image-to-image', attach: 'Add reference image', drop: 'Drop to use as reference (image-to-image)', on: 'Image mode on: describe it, optionally drop a reference image', ph: 'Describe the image… (drop a picture for image-to-image)', gen: 'Generate', t2i: 'Text-to-image', i2i: 'Image-to-image', working: 'Generating image…', done: 'Generated', dl: 'Download', fail: 'Generation failed', need: 'Type a prompt first', bad: 'PNG/JPEG/WebP only, max 8 MB', remove: 'Remove', keyHint: 'Add an image API key in Setting' },
};
export function imgLang() { try { return /^en/.test(localStorage.getItem('xc_lang_v1') || '') ? 'en' : 'zh'; } catch { return 'zh'; } }
const T = (k) => (IMGGEN_I18N[imgLang()] || IMGGEN_I18N.zh)[k];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function buildRequest(prompt, image) {
  const body = { prompt: String(prompt || '').trim() };
  if (image) body.image = image;
  return body;
}

function readAsDataUrl(file) {
  return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(file); });
}

export function mountImageGen(doc = document) {
  const panel = doc.getElementById('composerPanel');
  const tools = panel && panel.querySelector('.composer-tools');
  const input = doc.getElementById('composerInput');
  const sendBtn = doc.getElementById('sendBtn');
  if (!panel || !tools || !input || !sendBtn || panel.dataset.imggen) return null;
  panel.dataset.imggen = '1';
  const st = { on: false, image: null, busy: false, ph: input.placeholder };
  const style = doc.createElement('style');
  style.textContent = `.ig-btn{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--line,#333);background:transparent;color:inherit;border-radius:8px;padding:4px 8px;font-size:12px;cursor:pointer}.ig-btn.on{background:var(--accent,#d4a24c);color:#111;border-color:transparent}.ig-ref{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:12px}.ig-ref img{width:48px;height:48px;object-fit:cover;border-radius:6px}.ig-drop{outline:2px dashed var(--accent,#d4a24c);outline-offset:-4px}.ig-msg{margin:10px 0;padding:10px;border:1px solid var(--line,#333);border-radius:10px}.ig-msg .ig-grid{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.ig-msg figure{margin:0}.ig-msg img{max-width:320px;width:100%;border-radius:8px;display:block}.ig-msg a{font-size:12px;color:var(--accent,#d4a24c)}.ig-spin{display:inline-block;width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:igs 1s linear infinite;vertical-align:-2px;margin-right:6px}@keyframes igs{to{transform:rotate(360deg)}}.ig-err{color:#f87171}`;
  doc.head.appendChild(style);
  const btn = doc.createElement('button');
  btn.type = 'button'; btn.className = 'ig-btn'; btn.id = 'imgGenToggle'; btn.setAttribute('aria-pressed', 'false');
  const pick = doc.createElement('label');
  pick.className = 'ig-btn'; pick.hidden = true;
  pick.innerHTML = `🖼 <span></span><input id="imgGenFile" type="file" accept="image/png,image/jpeg,image/webp" hidden>`;
  const ref = doc.createElement('div'); ref.className = 'ig-ref'; ref.hidden = true;
  tools.prepend(pick); tools.prepend(btn); tools.after(ref);
  const label = () => {
    btn.innerHTML = `🎨 ${esc(T('toggle'))}`; btn.title = T('toggleTitle');
    pick.querySelector('span').textContent = T('attach');
    if (st.on) input.placeholder = T('ph');
  };
  label();
  const showRef = () => {
    if (!st.image) { ref.hidden = true; ref.innerHTML = ''; return; }
    ref.hidden = false;
    ref.innerHTML = `<img alt="" src="${st.image}"><span>${esc(T('i2i'))}</span><button type="button" class="ig-btn">${esc(T('remove'))}</button>`;
    ref.querySelector('button').onclick = () => { st.image = null; showRef(); };
  };
  const setOn = (on) => {
    st.on = on; btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', String(on)); pick.hidden = !on;
    input.placeholder = on ? T('ph') : st.ph;
    if (!on) { st.image = null; showRef(); }
  };
  btn.onclick = () => setOn(!st.on);
  const take = async (file) => {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 8 * 1024 * 1024) { alertBad(); return; }
    st.image = await readAsDataUrl(file); if (!st.on) setOn(true); showRef();
  };
  const alertBad = () => { ref.hidden = false; ref.innerHTML = `<span class="ig-err">${esc(T('bad'))}</span>`; };
  pick.querySelector('input').onchange = (e) => { take(e.target.files[0]); e.target.value = ''; };
  const zones = [panel, doc.getElementById('chatView'), doc.getElementById('composer')].filter(Boolean);
  for (const z of zones) {
    z.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.items || [])].some((i) => i.type.startsWith('image/'))) { e.preventDefault(); z.classList.add('ig-drop'); } });
    z.addEventListener('dragleave', () => z.classList.remove('ig-drop'));
    z.addEventListener('drop', (e) => {
      const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'));
      z.classList.remove('ig-drop');
      if (!f) return;
      e.preventDefault(); e.stopPropagation();
      if (panel.hidden) doc.getElementById('composerPill')?.click();
      take(f);
    });
  }
  input.addEventListener('paste', (e) => {
    const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
    if (f) { e.preventDefault(); take(f); }
  });
  const out = () => {
    const box = doc.getElementById('chatMessages');
    const view = doc.getElementById('chatView');
    if (box && view && !view.hidden) { doc.getElementById('chatEmpty')?.setAttribute('hidden', ''); return box; }
    let tray = doc.getElementById('imgGenTray');
    if (!tray) { tray = doc.createElement('div'); tray.id = 'imgGenTray'; tray.style.cssText = 'max-height:50vh;overflow:auto'; panel.insertBefore(tray, panel.querySelector('.composer-foot')); }
    return tray;
  };
  async function run() {
    const prompt = input.value.trim();
    if (!prompt) { input.focus(); input.placeholder = T('need'); return; }
    if (st.busy) return;
    st.busy = true; sendBtn.disabled = true;
    const mode = st.image ? T('i2i') : T('t2i');
    const card = doc.createElement('div'); card.className = 'ig-msg';
    card.innerHTML = `<div><b>${esc(mode)}</b> · ${esc(prompt)}</div>${st.image ? `<img alt="" src="${st.image}" style="max-width:96px;margin-top:6px">` : ''}<div class="ig-status"><span class="ig-spin"></span>${esc(T('working'))}</div>`;
    const where = out(); where.appendChild(card); card.scrollIntoView({ block: 'end', behavior: 'smooth' });
    const t0 = Date.now();
    try {
      const r = await fetch('/api/image/generate', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(buildRequest(prompt, st.image)) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.images) throw Object.assign(new Error(j.message || ('HTTP ' + r.status)), { code: j.error });
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      card.querySelector('.ig-status').innerHTML = `${esc(T('done'))} · ${esc(j.providerName || j.provider)} · ${secs}s`;
      const grid = doc.createElement('div'); grid.className = 'ig-grid';
      j.images.forEach((im, i) => {
        const src = im.dataUrl || im.url;
        const fig = doc.createElement('figure');
        fig.innerHTML = `<img alt="${esc(prompt)}" src="${esc(src)}"><a href="${esc(src)}" download="xconnect-image-${Date.now()}-${i + 1}.png" target="_blank" rel="noopener">⬇ ${esc(T('dl'))}</a>`;
        grid.appendChild(fig);
      });
      card.appendChild(grid);
      input.value = ''; st.image = null; showRef();
    } catch (e) {
      const keyLink = e.code === 'no_image_provider' || e.code === 'provider_auth' ? ` <a href="/settings#imgkeys">${esc(T('keyHint'))}</a>` : '';
      card.querySelector('.ig-status').innerHTML = `<span class="ig-err">${esc(T('fail'))}: ${esc(e.message)}</span>${keyLink}`;
    } finally { st.busy = false; sendBtn.disabled = false; card.scrollIntoView({ block: 'end' }); }
  }
  sendBtn.addEventListener('click', (e) => { if (!st.on) return; e.preventDefault(); e.stopImmediatePropagation(); run(); }, true);
  input.addEventListener('keydown', (e) => { if (st.on && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopImmediatePropagation(); run(); } }, true);
  window.addEventListener('storage', (e) => { if (e.key === 'xc_lang_v1') label(); });
  return { setOn, run, state: st };
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mountImageGen());
  else mountImageGen();
}
