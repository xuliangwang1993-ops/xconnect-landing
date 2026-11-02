// wb-i18n.js — zh→en for remaining static Workbench strings. Swaps exact text nodes,
// placeholder and title; keeps the original zh so switching back is instant. Follows xc:lang.
(() => {
  const D = {
    '把对话，落成卡片。':'Turn conversations into cards.','同一套账号、模型和业务接口。手机上是折叠工作台，宽屏是完整工作台。':'One account, models and APIs. Folded workbench on phone, full workbench on wide screens.',
    '账号密钥':'Account key','进入':'Enter','使用演示账号':'Use demo account','如何安装':'How to install','或直接进入你的 SubRouter 档位（不用找 key）':'Or go straight into your SubRouter tier (no key needed)',
    '字幕草稿':'Caption draft','已保存 · 待整理':'Saved · to tidy','独立审核':'Independent review','不是执行授权':'Not an execution approval','语音浮标':'Voice bubble','收起不挂断':'Collapse without hanging up',
    '返回':'Back','项目':'Project','项目树':'Tree','设置':'Settings','临时会话':'Temporary chat','项目与卡片':'Projects & cards','卡片':'Cards','作品':'Works','任务':'Tasks','助手':'Assistant','去选助手':'Choose assistant',
    '会话':'Chats','新建':'New','安装应用':'Install app','退出':'Sign out','项目工作台':'Project workbench','项目、卡片、作品和任务状态是主体。控制按需收起，不挡内容。':'Projects, cards, works and task status come first. Controls fold away when not needed.',
    '对话':'Chat','新会话':'New chat','重命名':'Rename','系统提示':'System prompt','没有选中的会话':'No chat selected','从侧栏选一个会话，或新建。会话名称在侧栏和会话管理里改，不占顶栏。':'Pick a chat from the sidebar or start a new one. Rename chats in the sidebar.',
    '新建会话':'New chat','语音 / 字幕 / 卡片 / 执行':'Voice / captions / cards / execution','输入 / 粘贴 / 附件':'Type / paste / attach','未选择会话':'No chat selected','草稿自动保存在本机；收起不丢。':'Drafts save locally; collapsing keeps them.',
    '未连接':'Not connected','目标卡：未选择':'Target card: none','点开始，允许麦克风，然后说话。':'Press start, allow the microphone, then speak.','音色':'Voice','选择模型':'Choose model','缩写只影响顶栏显示，不改真实 model_id。':'The short name only changes the top bar label, not the real model_id.',
    '账户 · 小助手 · 全部设置 →':'Account · Assistants · All settings →','外观':'Appearance','系统':'System','快捷栏':'Shortcuts','字幕接入':'Caption input','关于':'About','生成卡片':'Create card','标题':'Title','内容':'Content',
    '生成卡片不等于送审，更不等于批准执行。':'Creating a card is not submitting for review, let alone approving execution.','保存为草稿卡':'Save as draft card','确认':'Confirm','取消':'Cancel','卡片地图':'Card map',
    '颜色：草稿 / 待审 / 已审 / 执行中 / 完成 / 失败':'Colours: draft / pending / reviewed / running / done / failed','对话记录':'Transcript','语音进行中点击小助手可打开；展示该角色的回合记录。':'During voice, tap the assistant to open; shows this character\'s turns.',
    '发送':'Send','开始':'Start','停止':'Stop','关闭':'Close','保存':'Save','删除':'Delete','复制':'Copy','加载中…':'Loading…','暂无':'None yet','重试':'Retry',
  };
  const ATTR = ['placeholder', 'title', 'aria-label'];
  const orig = new WeakMap();
  const en = () => !/^zh/.test((() => { try { return localStorage.getItem('xc_lang_v1') || navigator.language || 'zh'; } catch { return 'zh'; } })());
  const R = Object.fromEntries(Object.entries(D).map(([z, e]) => [e, z]));
  function swap(s, toEn) { const t = s.trim(); if (!t) return s; const m = toEn ? D[t] : R[t]; return m ? s.replace(t, m) : s; }
  function run(root) {
    const toEn = en(); const w = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) { if (/^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentNode.nodeName)) continue; const v = swap(n.nodeValue, toEn); if (v !== n.nodeValue) n.nodeValue = v; }
    (root || document.body).querySelectorAll('[placeholder],[title],[aria-label]').forEach((el) => ATTR.forEach((a) => { const v = el.getAttribute(a); if (v) { const x = swap(v, toEn); if (x !== v) el.setAttribute(a, x); } }));
    document.documentElement.lang = toEn ? 'en' : 'zh-Hans';
  }
  let q = 0; const later = () => { if (!q) q = requestAnimationFrame(() => { q = 0; run(); }); };
  const start = () => { run(); new MutationObserver(later).observe(document.body, { childList: true, subtree: true, characterData: false }); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
  document.addEventListener('xc:lang', () => run()); window.addEventListener('storage', (e) => { if (e.key === 'xc_lang_v1') run(); });
  void orig;
})();
