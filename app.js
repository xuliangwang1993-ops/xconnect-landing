// X-connect Landing - Interactive Behaviors

class LanguageManager {
  constructor() {
    this.currentLang = localStorage.getItem('xconnect-lang') || 'zh';
    this.init();
  }

  init() {
    document.body.setAttribute('data-lang', this.currentLang);
    
    const toggle = document.getElementById('langToggle');
    if (toggle) {
      toggle.addEventListener('click', () => this.toggle());
    }
  }

  toggle() {
    this.currentLang = this.currentLang === 'zh' ? 'en' : 'zh';
    document.body.setAttribute('data-lang', this.currentLang);
    localStorage.setItem('xconnect-lang', this.currentLang);
    
    // 更新 placeholder
    const input = document.getElementById('intent-input');
    if (input) {
      const placeholder = this.currentLang === 'zh' 
        ? input.getAttribute('data-placeholder-zh')
        : input.getAttribute('data-placeholder-en');
      input.setAttribute('placeholder', placeholder);
    }
  }
}

class CapabilityGrid {
  // v2 PBR grid ported from capability-grid-v2.html (774f3b1 quote fixes kept).
  // Scroll-zoom: Ctrl/Meta + wheel only — never hijacks normal page scroll.
  // Pointer tracking uses window events because the canvas stays pointer-events:none
  // under the page content (see .capability-grid in styles.css).
  // Hover maps client → canvas CSS → inverse zoom into node space (fixes post-zoom offset).
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    this.nodes = [];
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.mode = 'pbr';
    this.mx = -999;
    this.my = -999;
    this.pointerCssX = null; // canvas-relative CSS px; null = no pointer
    this.pointerCssY = null;
    this.scale = 1;
    this.tx = 0;
    this.ty = 0;
    this.CONNECT = 150;
    this.NODE_COUNT = 64;
    this.t0 = performance.now();
    this.raf = null;
    this.reducedMotion = false;

    try {
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) {
      this.reducedMotion = false;
    }

    this.resize();
    this.initNodes();
    this.bindEvents();

    if (this.reducedMotion) {
      this.drawFrame(0);
    } else {
      this.raf = requestAnimationFrame((now) => this.frame(now));
    }
  }

  bindEvents() {
    this._onResize = () => {
      this.resize();
      if (this.reducedMotion) this.drawFrame(0);
    };
    window.addEventListener('resize', this._onResize);

    this._onPointerMove = (e) => {
      if (!this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      // CSS px relative to canvas — same space as this.width/this.height after setTransform(dpr).
      this.pointerCssX = e.clientX - rect.left;
      this.pointerCssY = e.clientY - rect.top;
    };
    this._onPointerLeave = () => {
      this.pointerCssX = null;
      this.pointerCssY = null;
      this.mx = -999;
      this.my = -999;
    };
    window.addEventListener('pointermove', this._onPointerMove);
    document.addEventListener('pointerleave', this._onPointerLeave);

    // Zoom only with Ctrl/Meta+wheel so normal scrolling is never blocked.
    this._onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      this.scale = Math.max(0.7, Math.min(1.8, this.scale + delta));
      if (this.reducedMotion) this.drawFrame(0);
    };
    window.addEventListener('wheel', this._onWheel, { passive: false });
  }

  resize() {
    if (!this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    this.dpr = dpr;
    this.width = w;
    this.height = h;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  initNodes() {
    const W = this.width;
    const H = this.height;
    this.nodes = [];
    for (let i = 0; i < this.NODE_COUNT; i++) {
      this.nodes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: 1.5 + Math.random() * 2.5,
        hue: Math.random() > 0.82 ? 38 : 0,
        pulse: Math.random() * Math.PI * 2,
        mat: Math.random()
      });
    }
  }

  dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Inverse of drawFrame zoom: translate(cx,cy) → scale(s) → translate(-cx+tx,-cy+ty).
  // Screen/CSS (sx,sy) → node space. Hit radius stays in node space (no /s needed).
  pointerToNode(cssX, cssY) {
    const s = this.scale || 1;
    const cx = this.width / 2;
    const cy = this.height / 2;
    return {
      x: (cssX - cx) / s + cx - this.tx,
      y: (cssY - cy) / s + cy - this.ty
    };
  }

  // Forward map used by tests / symmetry with draw transform.
  nodeToScreen(nx, ny) {
    const s = this.scale || 1;
    const cx = this.width / 2;
    const cy = this.height / 2;
    return {
      x: s * (nx - cx + this.tx) + cx,
      y: s * (ny - cy + this.ty) + cy
    };
  }

  syncHoverFromPointer() {
    if (this.pointerCssX == null || this.pointerCssY == null) {
      this.mx = -999;
      this.my = -999;
      return;
    }
    const p = this.pointerToNode(this.pointerCssX, this.pointerCssY);
    this.mx = p.x;
    this.my = p.y;
  }

  drawNode(n, t) {
    const ctx = this.ctx;
    const pulse = 0.6 + 0.4 * Math.sin(t * 0.002 + n.pulse);
    const dx = n.x - this.mx;
    const dy = n.y - this.my;
    const near = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 180);
    const glow = pulse * (1 + near * 1.8);

    if (this.mode === 'flat') {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = n.hue
        ? `rgba(251,191,106,${0.5 * glow})`
        : `rgba(255,255,255,${0.45 * glow})`;
      ctx.fill();
      if (near > 0.3) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 3.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${near * 0.08})`;
        ctx.fill();
      }
      return;
    }

    const g = ctx.createRadialGradient(
      n.x - n.r * 0.4, n.y - n.r * 0.4, n.r * 0.2,
      n.x, n.y, n.r * 4.5
    );
    if (n.mat < 0.45) {
      g.addColorStop(0, `rgba(255,245,230,${0.95 * glow})`);
      g.addColorStop(0.35, `rgba(251,191,106,${0.35 * glow})`);
      g.addColorStop(1, 'transparent');
    } else if (n.mat < 0.8) {
      g.addColorStop(0, `rgba(230,240,255,${0.8 * glow})`);
      g.addColorStop(0.4, `rgba(160,190,255,${0.2 * glow})`);
      g.addColorStop(1, 'transparent');
    } else {
      g.addColorStop(0, `rgba(40,40,48,${0.9 * glow})`);
      g.addColorStop(0.5, `rgba(90,90,100,${0.25 * glow})`);
      g.addColorStop(1, 'transparent');
    }
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r * 4.5, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    const sx = n.x - n.r * 0.5;
    const sy = n.y - n.r * 0.6;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, n.r * 1.8);
    sg.addColorStop(0, `rgba(255,255,255,${0.55 * glow})`);
    sg.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(sx, sy, n.r * 1.8, 0, Math.PI * 2);
    ctx.fillStyle = sg;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = n.hue
      ? `rgba(255,210,120,${0.9 * glow})`
      : `rgba(255,255,255,${0.85 * glow})`;
    ctx.fill();

    if (near > 0.25) {
      const bg = ctx.createRadialGradient(n.x, n.y, n.r, n.x, n.y, n.r * 7);
      bg.addColorStop(0, `rgba(245,158,11,${near * 0.18})`);
      bg.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r * 7, 0, Math.PI * 2);
      ctx.fillStyle = bg;
      ctx.fill();
    }
  }

  drawEdge(a, b, t) {
    const ctx = this.ctx;
    const d = this.dist(a, b);
    if (d > this.CONNECT) return;
    const alpha = (1 - d / this.CONNECT) * 0.55;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    if (this.mode === 'flat') {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.5})`;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      return;
    }

    ctx.save();
    ctx.shadowColor = 'rgba(245,158,11,.35)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    const lg = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    lg.addColorStop(0, `rgba(251,191,106,${alpha * 0.15})`);
    lg.addColorStop(0.5, `rgba(255,255,255,${alpha * 0.9})`);
    lg.addColorStop(1, `rgba(251,191,106,${alpha * 0.15})`);
    ctx.strokeStyle = lg;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.restore();

    if ((a.mat > 0.8 || b.mat > 0.8) && Math.random() > 0.7) {
      const steps = 4;
      for (let s = 1; s < steps; s++) {
        const u = s / steps;
        const px = a.x + dx * u + nx * (Math.random() - 0.5) * 3;
        const py = a.y + dy * u + ny * (Math.random() - 0.5) * 3;
        ctx.beginPath();
        ctx.arc(px, py, 0.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(120,120,130,${alpha * 0.4})`;
        ctx.fill();
      }
    }

    const pulsePos = ((t * 0.0015 + a.pulse * 0.1) % 1);
    const px = a.x + dx * pulsePos;
    const py = a.y + dy * pulsePos;
    const pg = ctx.createRadialGradient(px, py, 0, px, py, 5);
    pg.addColorStop(0, 'rgba(251,191,106,.8)');
    pg.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fillStyle = pg;
    ctx.fill();
  }

  drawFrame(t) {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;

    // Map cursor into node space with the current zoom before hit-testing.
    this.syncHoverFromPointer();

    // Transparent clear — canvas is a translucent overlay over the page bg.
    ctx.clearRect(0, 0, W, H);

    // Soft vignette + amber sweep (low alpha so homepage content stays readable).
    const vg = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.85);
    vg.addColorStop(0, 'transparent');
    vg.addColorStop(1, 'rgba(0,0,0,.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    const sweep = ctx.createRadialGradient(
      W * 0.15 + Math.sin(t * 0.0004) * W * 0.1, H * 0.1, 0,
      W * 0.15, H * 0.1, W * 0.6
    );
    sweep.addColorStop(0, 'rgba(245,158,11,.06)');
    sweep.addColorStop(1, 'transparent');
    ctx.fillStyle = sweep;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(this.scale, this.scale);
    ctx.translate(-W / 2 + this.tx, -H / 2 + this.ty);

    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        this.drawEdge(this.nodes[i], this.nodes[j], t);
      }
    }
    for (const n of this.nodes) {
      this.drawNode(n, t);
    }
    ctx.restore();
  }

  frame(now) {
    const t = now - this.t0;
    const W = this.width;
    const H = this.height;

    for (const n of this.nodes) {
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < 0 || n.x > W) n.vx *= -1;
      if (n.y < 0 || n.y > H) n.vy *= -1;
    }

    this.drawFrame(t);
    this.raf = requestAnimationFrame((ts) => this.frame(ts));
  }
}

class InputManager {
  constructor() {
    this.input = document.getElementById('intent-input');
    if (!this.input) return;
    
    this.init();
  }

  init() {
    // 自动调整高度
    this.input.addEventListener('input', () => {
      this.input.style.height = 'auto';
      this.input.style.height = Math.min(this.input.scrollHeight, 200) + 'px';
    });
    
    // Enter 提交（Shift+Enter 换行）
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.submit();
      }
    });
    
    // 设置初始 placeholder
    const lang = document.body.getAttribute('data-lang');
    const placeholder = lang === 'zh' 
      ? this.input.getAttribute('data-placeholder-zh')
      : this.input.getAttribute('data-placeholder-en');
    this.input.setAttribute('placeholder', placeholder);
  }

  submit() {
    const value = this.input.value.trim();
    if (!value) return;
    
    const submitManager = new SubmitManager();
    submitManager.show(value);
    
    this.input.value = '';
    this.input.style.height = 'auto';
  }
}

class SubmitManager {
  show(intent) {
    const lang = document.body.getAttribute('data-lang');
    const title = lang === 'zh' ? '需求已收到' : 'Request Received';
    const message = lang === 'zh' 
      ? `我们会尽快评估您的需求并与您联系。\n\n您的需求：${intent}`
      : `We will evaluate your request and contact you soon.\n\nYour request: ${intent}`;
    
    // 创建模态窗口
    const modal = document.createElement('div');
    modal.className = 'submit-modal';
    modal.innerHTML = `
      <div class="submit-modal-content">
        <h3>${title}</h3>
        <p style="white-space: pre-wrap; line-height: 1.6;">${message}</p>
        <button class="submit-modal-close">${lang === 'zh' ? '关闭' : 'Close'}</button>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // 关闭按钮
    modal.querySelector('.submit-modal-close').addEventListener('click', () => {
      modal.remove();
    });
    
    // 点击背景关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }
}

class ScrollHint {
  constructor() {
    this.hint = document.querySelector('.scroll-hint');
    if (!this.hint) return;
    
    this.hint.addEventListener('click', () => {
      const services = document.querySelector('.services');
      if (services) {
        services.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
}

class ServiceCards {
  constructor() {
    this.cards = document.querySelectorAll('.service-card');
    this.cards.forEach(card => {
      card.addEventListener('click', () => this.showDetail(card));
    });
  }

  showDetail(card) {
    const service = card.getAttribute('data-service');
    const lang = document.body.getAttribute('data-lang');
    
    const details = {
      'brand-assets': {
        zh: '品牌基础素材包提供完整的视觉识别系统，包含 SVG 矢量标志、多尺寸 PNG 输出、印刷级 PDF、色彩规范文档和使用指南。使用 VectorCraft 和 PdfCraft 工具生产，确保跨平台一致性。',
        en: 'Brand Asset Package provides a complete visual identity system, including SVG vector logo, multi-size PNG outputs, print-ready PDF, color specification document, and usage guidelines. Produced using VectorCraft and PdfCraft tools to ensure cross-platform consistency.'
      },
      'documents': {
        zh: '菜单与业务文档服务将您的内容转化为专业排版的文档，支持 A4/A3 印刷输出和屏幕优化版本。使用 WordCraft 排版引擎和 PdfCraft 渲染，交付印刷级 PDF 和可编辑源文件。',
        en: 'Menu & Business Documents service transforms your content into professionally typeset documents, supporting A4/A3 print output and screen-optimized versions. Uses WordCraft layout engine and PdfCraft rendering to deliver print-ready PDFs and editable source files.'
      },
      'website': {
        zh: '一页式营销站提供完整的单页网站解决方案，包含响应式设计、静态站点文件、在线部署地址和移动端截图。使用手写 HTML/CSS/JS 配合 PhotoCraft 图像处理，确保快速加载和跨设备兼容。',
        en: 'Single-Page Marketing Site provides a complete single-page website solution, including responsive design, static site files, live deployment URL, and mobile screenshots. Uses hand-written HTML/CSS/JS with PhotoCraft image processing to ensure fast loading and cross-device compatibility.'
      }
    };
    
    const content = details[service]?.[lang] || '';
    if (!content) return;
    
    const modal = document.createElement('div');
    modal.className = 'service-modal';
    modal.innerHTML = `
      <div class="service-modal-content">
        <button class="service-modal-close">&times;</button>
        <h3>${card.querySelector('.card-title').textContent}</h3>
        <p style="line-height: 1.8; color: var(--text-secondary); margin-top: 16px;">${content}</p>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.service-modal-close').addEventListener('click', () => {
      modal.remove();
    });
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }
}

class CTAButton {
  constructor() {
    this.btn = document.getElementById('ctaBtn');
    if (!this.btn) return;
    
    this.btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => {
        document.getElementById('intent-input')?.focus();
      }, 500);
    });
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new LanguageManager();
  new CapabilityGrid('capability-grid');
  new InputManager();
  new ScrollHint();
  new ServiceCards();
  new CTAButton();
  
  // 提交按钮
  const submitBtn = document.querySelector('.submit-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      const inputManager = new InputManager();
      inputManager.submit();
    });
  }
});
