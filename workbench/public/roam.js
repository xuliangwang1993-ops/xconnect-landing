// roam.js — 小助理：空闲时在屏幕上慢慢走动；需要引导注意力时 guideTo 目标旁并停住
// - 拖拽后停在用户放的位置；parkDefault() 恢复走动
// - 说话时切 talk 帧；prefers-reduced-motion 时只换图不位移
// - 点击：若语音会话中由宿主打开对话 mini map；否则打开选助手页

const ASSET = (typeof window !== 'undefined' && window.__XC_ASSET_BASE) || '';

let el = null;
let talkTimer = null;
let cur = { avatar: '', name: '' };
let onResize = null;
let dragState = null;
let parked = null; // { x, y }
let guided = false;
let wanderTimer = null; // 空闲时慢慢走动；被引导/拖拽/说话时停住
let clickHandler = null; // () => boolean|void ; return true = handled

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function size() {
  if (!el) return 96;
  return el.offsetWidth || 96;
}

function clampPark(x, y) {
  const pad = 12;
  const s = size();
  const maxX = Math.max(pad, window.innerWidth - s - pad);
  const maxY = Math.max(pad, window.innerHeight - s - pad);
  return {
    x: Math.min(maxX, Math.max(pad, x)),
    y: Math.min(maxY, Math.max(pad, y)),
  };
}

function applyPark(x, y, { animate = true } = {}) {
  if (!el) return;
  const p = clampPark(x, y);
  parked = p;
  if (!animate || reduced()) el.style.transition = 'none';
  else el.style.transition = 'transform 3.4s cubic-bezier(.4, 0, .2, 1), opacity .5s ease';
  // dropIn() 用 left/top 定位；这里统一回到 transform 定位，避免两者叠加跑出屏幕
  el.style.left = '0px';
  el.style.top = '0px';
  el.style.transform = `translate(${p.x.toFixed(0)}px, ${p.y.toFixed(0)}px)`;
}

function defaultCorner() {
  const s = size();
  return {
    x: Math.max(18, window.innerWidth - s - 24),
    y: Math.max(110, window.innerHeight - s - Math.max(160, Math.round(window.innerHeight * 0.22))),
  };
}

function placeDefault(first) {
  if (!el || dragState) return;
  const c = parked || defaultCorner();
  applyPark(c.x, c.y, { animate: !first });
  if (first) requestAnimationFrame(() => el && el.classList.add('in'));
}

function setSrc(file) {
  if (!el) return;
  const next = `${ASSET}/characters/${cur.avatar}/${file}`;
  if (!el.src.endsWith(next)) el.src = next;
}

/** Move beside a DOM element (or {x,y}) and stay there until next guide/unpark. */
export function guideTo(target, { offsetX = 12, offsetY = -8 } = {}) {
  if (!el) return;
  guided = true;
  let x, y;
  if (target && typeof target.getBoundingClientRect === 'function') {
    const r = target.getBoundingClientRect();
    const s = size();
    // Prefer right side of the field; if no room, sit to the left
    const right = r.right + offsetX;
    const left = r.left - s - offsetX;
    x = right + s <= window.innerWidth - 8 ? right : left;
    y = r.top + offsetY;
  } else if (target && typeof target.x === 'number') {
    x = target.x; y = target.y;
  } else if (typeof target === 'string') {
    const node = document.querySelector(target);
    if (!node) return;
    return guideTo(node, { offsetX, offsetY });
  } else {
    return;
  }
  applyPark(x, y, { animate: true });
}

export function parkDefault() {
  guided = false;
  const c = defaultCorner();
  applyPark(c.x, c.y, { animate: true });
}

export function setRoamClickHandler(fn) {
  clickHandler = typeof fn === 'function' ? fn : null;
}

function onPointerDown(e) {
  if (!el) return;
  e.preventDefault();
  const rect = el.getBoundingClientRect();
  const cx = e.clientX ?? e.touches?.[0]?.clientX;
  const cy = e.clientY ?? e.touches?.[0]?.clientY;
  dragState = { startX: cx, startY: cy, elX: rect.left, elY: rect.top, moved: false };
  el.style.transition = 'none';
  el.style.cursor = 'grabbing';
}

function onPointerMove(e) {
  if (!dragState || !el) return;
  const x = e.clientX ?? e.touches?.[0]?.clientX;
  const y = e.clientY ?? e.touches?.[0]?.clientY;
  const dx = x - dragState.startX;
  const dy = y - dragState.startY;
  if (Math.abs(dx) > 5 || Math.abs(dy) > 5) dragState.moved = true;
  applyPark(dragState.elX + dx, dragState.elY + dy, { animate: false });
}

function onPointerUp() {
  if (!dragState) return;
  const wasDrag = dragState.moved;
  dragState = null;
  if (el) {
    el.style.transition = '';
    el.style.cursor = 'grab';
  }
  if (wasDrag) {
    guided = true; // user parked it
    return;
  }
  try {
    if (clickHandler && clickHandler() === true) return;
  } catch {}
  import('./lounge.js').then((m) => m.openLounge()).catch(() => {});
}

function wanderStep() {
  if (!el) return;
  const busy = guided || dragState || el.dataset.talking || reduced() ||
    (typeof document !== 'undefined' && document.visibilityState === 'hidden');
  if (!busy) {
    const s = size();
    const x = 12 + Math.random() * Math.max(0, window.innerWidth - s - 24);
    const y = 72 + Math.random() * Math.max(0, window.innerHeight - s - 72 - 24);
    applyPark(x, y, { animate: true });
  }
  wanderTimer = setTimeout(wanderStep, 6000 + Math.random() * 6000);
}

export function mountRoam(avatar, name) {
  unmountRoam();
  if (!avatar) return;
  cur = { avatar, name: name || '' };

  el = document.createElement('img');
  el.className = 'roam-pet';
  el.alt = name || '小助手';
  el.decoding = 'async';
  el.style.cursor = 'grab';
  el.style.pointerEvents = 'auto';
  el.title = name ? `${name} · 点击查看对话` : '小助手';
  el.src = `${ASSET}/characters/${avatar}/still.webp`;
  const idle = new Image();
  idle.src = `${ASSET}/characters/${avatar}/idle.webp`;
  idle.onload = () => { if (el && !el.dataset.talking) setSrc('idle.webp'); };

  el.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove, { passive: false });
  document.addEventListener('pointerup', onPointerUp);
  el.addEventListener('touchstart', onPointerDown, { passive: false });
  document.addEventListener('touchmove', onPointerMove, { passive: false });
  document.addEventListener('touchend', onPointerUp);

  document.body.appendChild(el);
  placeDefault(true);

  onResize = () => {
    if (dragState) return;
    if (parked) applyPark(parked.x, parked.y, { animate: false });
    else placeDefault(false);
  };
  window.addEventListener('resize', onResize, { passive: true });
  clearTimeout(wanderTimer);
  wanderTimer = setTimeout(wanderStep, 2500);
}

export function setRoamMood(mood) {
  if (!el || !cur.avatar) return;
  if (mood === 'talk') {
    if (!el.dataset.talking) {
      el.dataset.talking = '1';
      setSrc('talk.webp');
    }
    clearTimeout(talkTimer);
    talkTimer = setTimeout(() => {
      if (!el) return;
      delete el.dataset.talking;
      setSrc('idle.webp');
    }, 900);
    return;
  }
  clearTimeout(talkTimer);
  delete el.dataset.talking;
  setSrc('idle.webp');
}

export function unmountRoam() {
  clearTimeout(talkTimer);
  talkTimer = null;
  clearTimeout(wanderTimer);
  wanderTimer = null;
  if (onResize) { window.removeEventListener('resize', onResize); onResize = null; }
  if (el) {
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('touchstart', onPointerDown);
    el.remove();
    el = null;
  }
  document.removeEventListener('pointermove', onPointerMove);
  document.removeEventListener('pointerup', onPointerUp);
  document.removeEventListener('touchmove', onPointerMove);
  document.removeEventListener('touchend', onPointerUp);
  dragState = null;
  parked = null;
  guided = false;
  cur = { avatar: '', name: '' };
}

/** 呼叫：从屏幕顶部落下（ease-out 弹跳），停在右下角，冒一个问候气泡。 */
export function dropIn(greeting, { ms = 4200 } = {}) {
  if (!el) return false;
  const s = size();
  const x = Math.max(12, window.innerWidth - s - 24);
  const y = Math.max(12, window.innerHeight - s - 96);
  parked = { x, y };
  el.style.transition = 'none';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.transform = '';
  if (!reduced() && el.animate) {
    el.animate([
      { transform: `translateY(${-y - s}px)`, offset: 0 },
      { transform: 'translateY(0)', offset: 0.6, easing: 'ease-out' },
      { transform: 'translateY(-28px)', offset: 0.75, easing: 'ease-in' },
      { transform: 'translateY(0)', offset: 0.88, easing: 'ease-out' },
      { transform: 'translateY(-8px)', offset: 0.94 },
      { transform: 'translateY(0)', offset: 1 },
    ], { duration: 900, easing: 'ease-out' });
  }
  if (greeting) {
    const b = document.createElement('div');
    b.className = 'roam-bubble';
    b.textContent = greeting;
    b.style.cssText = `position:fixed;z-index:9999;right:${Math.max(12, window.innerWidth - x - s / 2)}px;bottom:${window.innerHeight - y + 6}px;max-width:240px;background:#16181d;color:#ececef;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:8px 12px;font:13px/1.4 system-ui,"PingFang SC",sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.4)`;
    setTimeout(() => document.body.appendChild(b), reduced() ? 0 : 700);
    setTimeout(() => b.remove(), ms + 700);
    setRoamMood('talk');
  }
  return true;
}
