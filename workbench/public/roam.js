// roam.js — 定点引导的小助理（不再满屏乱飘）
// - 默认停在角落或上次停靠点；需要引导注意力时 moveTo / guideTo 目标旁并停住
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
