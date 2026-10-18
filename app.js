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
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    
    this.ctx = this.canvas.getContext('2d');
    this.nodes = [];
    this.connections = [];
    this.resize();
    this.initNodes();
    this.animate();
    
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = rect.height;
  }

  initNodes() {
    const nodeCount = Math.floor((this.width * this.height) / 15000);
    this.nodes = [];
    
    for (let i = 0; i < nodeCount; i++) {
      this.nodes.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: Math.random() * 1.5 + 0.5
      });
    }
  }

  animate() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    
    // 更新节点位置
    this.nodes.forEach(node => {
      node.x += node.vx;
      node.y += node.vy;
      
      if (node.x < 0 || node.x > this.width) node.vx *= -1;
      if (node.y < 0 || node.y > this.height) node.vy *= -1;
    });
    
    // 绘制连线
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    this.ctx.lineWidth = 0.5;
    
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const dx = this.nodes[i].x - this.nodes[j].x;
        const dy = this.nodes[i].y - this.nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 150) {
          this.ctx.beginPath();
          this.ctx.moveTo(this.nodes[i].x, this.nodes[i].y);
          this.ctx.lineTo(this.nodes[j].x, this.nodes[j].y);
          this.ctx.globalAlpha = 1 - dist / 150;
          this.ctx.stroke();
        }
      }
    }
    
    // 绘制节点
    this.ctx.globalAlpha = 0.6;
    this.ctx.fillStyle = '#ffffff';
    this.nodes.forEach(node => {
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      this.ctx.fill();
    });
    
    this.ctx.globalAlpha = 1;
    requestAnimationFrame(() => this.animate());
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
