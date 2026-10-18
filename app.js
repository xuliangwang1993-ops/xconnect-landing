/**
 * X-connect · Stage & Production Conduit Interactive Application
 * Grounded in real Craft Service Architect data (12 installed CLIs, 14 service cards)
 * and real X-connect Order Gateway (https://api.x-connect.ai).
 */
(function () {
  'use strict';

  const GATEWAY_BASE = 'https://api.x-connect.ai';
  let currentLang = 'zh';
  let currentMode = 'standard'; // 'standard' | 'advanced'
  let currentTopoFilter = 'all';
  let currentCatalogFilter = 'all';
  let lastOrderId = null;

  // ── 14 张真实服务卡数据（严格对齐 service-cards.md 与 implementation-order.md） ──
  const SERVICES = [
    {
      id: 'S03',
      tier: 'V',
      batch: 1,
      preset: 'menu',
      zh: {
        title: '菜单 / 价目表 / 业务文档排版',
        tierLabel: 'V · 已验证样品 (自验)',
        audience: '餐馆、咖啡馆、服务商；把清单排成可印刷 A4/A3 与手机可读正式文档',
        deliverables: '印刷 PDF + 屏幕 PDF + 可编辑 .docx/.md + 首屏渲染图',
        engines: 'WordCraft 0.7.0 → PdfCraft 0.8.0',
        proof: 'menu.pdf (73KB) / spec.pdf (98KB)',
        exclusions: '不含菜品摄影、营养计算、原创插画、印刷厂 CMYK 打样',
        defaultAccept: '菜品条数与金额求和 100% 吻合，文字可提取，预览无溢出压字'
      },
      en: {
        title: 'Menu / Price List / Business Doc Typesetting',
        tierLabel: 'Tier V · Verified Sample',
        audience: 'Restaurants, cafes & local businesses; turn raw lists into print & mobile PDFs',
        deliverables: 'Print PDF + Screen PDF + Editable .docx/.md + Page Preview PNG',
        engines: 'WordCraft 0.7.0 → PdfCraft 0.8.0',
        proof: 'menu.pdf (73KB) / spec.pdf (98KB)',
        exclusions: 'Excludes photography, nutrition lab calc, custom illustration, press proofing',
        defaultAccept: '100% item count & price sum match, searchable text, zero layout clipping'
      }
    },
    {
      id: 'S02',
      tier: 'V',
      batch: 1,
      preset: 'brand',
      zh: {
        title: '品牌基础素材包（矢量与多规格导出）',
        tierLabel: 'V · 已验证样品 (自验)',
        audience: '新开业门店与创作者；一份能直接用于招牌、社媒与文档的标准标志套件',
        deliverables: 'logo.svg + logo.pdf + 透明 logo.png (1024/512/256) + 色值说明',
        engines: 'VectorCraft 0.11.0 → PdfCraft 0.8.0',
        proof: 'logo.pdf (20.7KB) / logo.png (84KB)',
        exclusions: '不含商标法律检索、商业字体授权购买、包装刀版结构设计',
        defaultAccept: 'SVG 放大无锯齿，PNG 带透明通道无灰边，色值与规范表一致'
      },
      en: {
        title: 'Brand Mark & Vector Asset Suite',
        tierLabel: 'Tier V · Verified Sample',
        audience: 'New shops & creators; production-ready vector mark & multi-resolution exports',
        deliverables: 'logo.svg + logo.pdf + transparent logo.png (1024/512/256) + color spec',
        engines: 'VectorCraft 0.11.0 → PdfCraft 0.8.0',
        proof: 'logo.pdf (20.7KB) / logo.png (84KB)',
        exclusions: 'Excludes trademark legal search, commercial font licensing, packaging dielines',
        defaultAccept: 'Crisp SVG scaling, verified PNG alpha channel, exact hex color match'
      }
    },
    {
      id: 'S14',
      tier: 'V',
      batch: 1,
      preset: 'site',
      zh: {
        title: '一页式互动营销与接单站',
        tierLabel: 'V · 已验证样品 (自验)',
        audience: '新品发布、门店开业、独立项目；能看、能选规格、能委托下单并独立部署的网站',
        deliverables: '完整源码 (HTML/CSS/JS) + 品牌矢量与PDF附件 + 线上可访问预览地址',
        engines: 'Web + VectorCraft + WordCraft + PhotoCraft',
        proof: 'sanxian-shouzuo.onrender.com (已上线)',
        exclusions: '不含第三方收银牌照、实时库存 ERP、SEO 排名承诺、7×24 运维',
        defaultAccept: '线上 HTTP 200，390px 手机端无横向溢出，双语切换与下单流程完整走通'
      },
      en: {
        title: 'Single-Page Interactive Product & Order Site',
        tierLabel: 'Tier V · Verified Sample',
        audience: 'Launches, shops & indie projects; interactive showcase with order intake & live URL',
        deliverables: 'Full static bundle (HTML/CSS/JS) + Vector/PDF assets + Live Preview URL',
        engines: 'Web + VectorCraft + WordCraft + PhotoCraft',
        proof: 'sanxian-shouzuo.onrender.com (Live)',
        exclusions: 'Excludes merchant payment gateway licensing, ERP inventory, SEO rank guarantees',
        defaultAccept: 'HTTP 200 live, zero horizontal overflow on 390px mobile, complete order flow'
      }
    },
    {
      id: 'S01',
      tier: 'F',
      batch: 2,
      preset: 'custom',
      zh: {
        title: '商品 / 菜品图批量精修与多尺寸导出',
        tierLabel: 'F · 流程就绪·首单试样',
        audience: '餐饮与电商小商户；20–200 张实拍图统一色调、裁切、去灰并导出三档 WebP/JPEG',
        deliverables: '1080/1600/2048 三档 WebP + JPEG + manifest.csv 尺寸对照表',
        engines: 'LightCraft 0.8.0 → PhotoCraft 0.9.0',
        proof: 'photo-pipeline v1 命令链已实测',
        exclusions: '不含复杂发丝抠图换背景、印刷 CMYK 分色、版权素材采购',
        defaultAccept: '抽检 10% 无色带，photocraft info 核对尺寸与 manifest 行数 100% 一致'
      },
      en: {
        title: 'Batch Product & Dish Photo Grading',
        tierLabel: 'Tier F · Pipeline Ready',
        audience: 'Food & e-commerce merchants; unify 20–200 photos in tone, crop & multi-size WebP',
        deliverables: '1080/1600/2048 WebP & JPEG + manifest.csv dimension ledger',
        engines: 'LightCraft 0.8.0 → PhotoCraft 0.9.0',
        proof: 'photo-pipeline v1 CLI verified',
        exclusions: 'Excludes complex background compositing, print CMYK profiles, stock licensing',
        defaultAccept: '10% visual QA with zero banding, file count & dimensions match manifest.csv'
      }
    },
    {
      id: 'S04',
      tier: 'F',
      batch: 2,
      preset: 'custom',
      zh: {
        title: '经营数据报告与核算图表',
        tierLabel: 'F · 流程就绪·首单试样',
        audience: '小企业季度总结、合作方说明材料；把表格数据转化为带公式核对的正式报告',
        deliverables: 'report.docx + report.pdf + 封面 PNG + 公式重算底稿 .xlsx',
        engines: 'GridCraft 0.7.0 → WordCraft → DesignCraft',
        proof: 'data-report v1 跨三引擎流程',
        exclusions: '不含注册会计师审计意见、税务申报代理、预测建模',
        defaultAccept: 'GridCraft 公式重算一致，图表数值与原表零误差，PDF 页码页眉完整'
      },
      en: {
        title: 'Business Data Report & Verified Charts',
        tierLabel: 'Tier F · Pipeline Ready',
        audience: 'SME quarterly reviews & partner briefs; turn spreadsheets into typeset reports',
        deliverables: 'report.docx + report.pdf + Cover PNG + recalculated .xlsx workbook',
        engines: 'GridCraft 0.7.0 → WordCraft → DesignCraft',
        proof: 'data-report v1 3-engine workflow',
        exclusions: 'Excludes certified audit opinions, tax filing, predictive financial modeling',
        defaultAccept: 'Formula recalculation exit code 0, chart numbers match table cells exactly'
      }
    },
    {
      id: 'S05',
      tier: 'F',
      batch: 2,
      preset: 'custom',
      zh: {
        title: '路演 / 提案演示文稿 (Deck)',
        tierLabel: 'F · 流程就绪·首单试样',
        audience: '融资路演、商务投标、内部汇报；把大纲与数据表排成结构清晰的 16:9 演示稿',
        deliverables: '.pptx 可编辑源文件 + .pdf + 逐页渲染 PNG 预览包',
        engines: 'GridCraft 0.7.0 → DeckCraft 0.7.0',
        proof: 'deck-builder v1 流程就绪',
        exclusions: '不含演讲逐字稿陪练、复杂 3D 转场动画、付费商业图库',
        defaultAccept: '逐页 render_slide 检查无文字溢出压边，图表数值与原表一致'
      },
      en: {
        title: 'Pitch & Proposal Presentation Deck',
        tierLabel: 'Tier F · Pipeline Ready',
        audience: 'Fundraising, bids & internal reviews; turn outlines and tables into 16:9 decks',
        deliverables: 'Editable .pptx + .pdf + slide-by-slide PNG preview pack',
        engines: 'GridCraft 0.7.0 → DeckCraft 0.7.0',
        proof: 'deck-builder v1 workflow ready',
        exclusions: 'Excludes pitch coaching, custom 3D transitions, paid stock photography',
        defaultAccept: 'Slide-by-slide render check with zero text overflow, accurate chart values'
      }
    },
    {
      id: 'S06',
      tier: 'C',
      batch: 4,
      preset: 'custom',
      zh: {
        title: '多平台短视频成品包',
        tierLabel: 'C · 工具已装·定制试样',
        audience: '门店与创作者；把实拍片段与字幕剪成 9:16 / 1:1 / 16:9 成品',
        deliverables: '三比例 MP4 (H.264/AAC) + 封面 PNG + .srt 字幕文件',
        engines: 'FilmCraft 0.8.0 + SoundCraft 0.7.0',
        proof: 'CLI 0.8.0 已装，首支 15 秒样片待排产',
        exclusions: '不含上门拍摄、商业版权音乐采购、平台代运营审核',
        defaultAccept: 'ffprobe 核对帧率/分辨率，响度 -14 LUFS，无黑帧且字幕对点'
      },
      en: {
        title: 'Multi-Format Short Video Package',
        tierLabel: 'Tier C · Custom Sample',
        audience: 'Merchants & creators; cut raw clips and captions into 9:16 / 1:1 / 16:9 MP4s',
        deliverables: 'Three aspect-ratio MP4s + Cover PNG + .srt captions',
        engines: 'FilmCraft 0.8.0 + SoundCraft 0.7.0',
        proof: 'CLI 0.8.0 installed; 15s pilot sample on request',
        exclusions: 'Excludes on-site filming, commercial music licensing, social account management',
        defaultAccept: 'ffprobe frame/resolution check, -14 LUFS loudness, zero black frames'
      }
    },
    {
      id: 'S07',
      tier: 'C',
      batch: 3,
      preset: 'custom',
      zh: {
        title: '播客单集混音与文稿交付',
        tierLabel: 'C · 工具已装·定制试样',
        audience: '独立播客与品牌对谈；从多轨录音混音导出标准响度 MP3 并整理章节文稿',
        deliverables: 'epXX.mp3 (-16 LUFS) + shownotes.md + chapters.txt',
        engines: 'SoundCraft 0.7.0 + WordCraft 0.7.0',
        proof: 'podcast-produce v1 工具就绪',
        exclusions: '不含重度底噪修复、商业配乐授权、母带级出版工程',
        defaultAccept: '立体声 -16±1 LUFS 无削波，章节时间戳与音频严丝合缝'
      },
      en: {
        title: 'Podcast Episode Mix & Shownotes',
        tierLabel: 'Tier C · Custom Sample',
        audience: 'Indie & brand podcasts; multitrack bounce to -16 LUFS MP3 with chapter notes',
        deliverables: 'epXX.mp3 (-16 LUFS) + shownotes.md + chapters.txt',
        engines: 'SoundCraft 0.7.0 + WordCraft 0.7.0',
        proof: 'podcast-produce v1 CLI ready',
        exclusions: 'Excludes heavy spectral denoising, music licensing, studio mastering',
        defaultAccept: '-16±1 LUFS stereo with zero clipping, accurate chapter timestamps'
      }
    },
    {
      id: 'S08',
      tier: 'C',
      batch: 4,
      preset: 'custom',
      zh: {
        title: '工程图纸归档 (CAD → 可检索 PDF)',
        tierLabel: 'C · 工具已装·定制试样',
        audience: '工程与装修小团队；把 DWG/DXF 目录批量转为可检索图号的 PDF 套图',
        deliverables: '合并 PDF 套图 + index.csv (图号/标题/页码) + 缩略图',
        engines: 'CADCraft 0.7.0 → PdfCraft 0.8.0',
        proof: 'drawing-export v1 工具已装',
        exclusions: '不含结构力学计算、建筑规范审图签字、BIM 建模与 DWG 修改',
        defaultAccept: '页数与源文件数一致，pdfcraft text 可检索全部图号'
      },
      en: {
        title: 'CAD Drawing Archive (DXF/DWG → PDF)',
        tierLabel: 'Tier C · Custom Sample',
        audience: 'Engineering & fit-out teams; convert DWG/DXF folders into indexed PDF sets',
        deliverables: 'Combined PDF set + index.csv (sheet ID/title/page) + thumbnails',
        engines: 'CADCraft 0.7.0 → PdfCraft 0.8.0',
        proof: 'drawing-export v1 CLI installed',
        exclusions: 'Excludes structural calculation, code compliance sign-off, BIM or DWG editing',
        defaultAccept: 'Page count matches source files, sheet numbers searchable via pdfcraft text'
      }
    },
    {
      id: 'S09',
      tier: 'C',
      batch: 3,
      preset: 'custom',
      zh: {
        title: '扫描件 OCR 可检索双层档案',
        tierLabel: 'C · 工具已装·定制试样',
        audience: '会计、咨询与小企业；把纸质扫描 PDF 转为可搜索、可复制的双层文档',
        deliverables: '双层可搜索 PDF + 提取文本 text.txt + 抽检准确率表',
        engines: 'PdfCraft 0.8.0 (163 MCP tools)',
        proof: 'PdfCraft OCR 与 check 命令就绪',
        exclusions: '不含潦草手写体还原、复杂跨页表格重构、法律公证效力',
        defaultAccept: '页数不变，随机抽检 5 页人工比对关键词可搜索命中'
      },
      en: {
        title: 'Scanned PDF OCR Searchable Archive',
        tierLabel: 'Tier C · Custom Sample',
        audience: 'Accounting & small offices; turn flat scans into searchable dual-layer PDFs',
        deliverables: 'Searchable PDF + extracted text.txt + 5-page QA accuracy sheet',
        engines: 'PdfCraft 0.8.0 (163 MCP tools)',
        proof: 'PdfCraft OCR & check commands ready',
        exclusions: 'Excludes cursive handwriting, complex table reconstruction, legal notarization',
        defaultAccept: 'Page count preserved, keyword search hits verified across 5 sampled pages'
      }
    },
    {
      id: 'S10',
      tier: 'C',
      batch: 3,
      preset: 'custom',
      zh: {
        title: '经营数据工作簿 (公式与图表自动化)',
        tierLabel: 'C · 工具已装·定制试样',
        audience: '门店主与自由职业者；把零散流水整理成带自动汇总公式与图表的规范 Excel',
        deliverables: 'workbook.xlsx (含公式、命名区域、图表) + check 校验报告',
        engines: 'GridCraft 0.7.0',
        proof: 'GridCraft 21 项表格工具已装',
        exclusions: '不含 VBA 宏编程、外部数据库实时连接、财务税务审计',
        defaultAccept: 'gridcraft check 退出码为 0，合计项回算一致，无硬编码死数字'
      },
      en: {
        title: 'Business Spreadsheet & Formula Workbook',
        tierLabel: 'Tier C · Custom Sample',
        audience: 'Shop owners & freelancers; structure raw CSVs into formula-driven .xlsx files',
        deliverables: 'workbook.xlsx (formulas, named ranges, charts) + check report',
        engines: 'GridCraft 0.7.0',
        proof: 'GridCraft 21 CLI/MCP tools installed',
        exclusions: 'Excludes VBA macros, live database connectors, statutory tax audit',
        defaultAccept: 'gridcraft check exit code 0, totals recalculate cleanly with no hardcoded sums'
      }
    },
    {
      id: 'S11',
      tier: 'C',
      batch: 3,
      preset: 'custom',
      zh: {
        title: '可复用批量套版模板产品',
        tierLabel: 'C · 工具已装·定制试样',
        audience: '每周需发同版式价目/上新海报的商户；做一套换表格数据就能出图的模板',
        deliverables: 'DesignCraft/PhotoCraft 模板文件 + 替换说明.md + 3 套实测样张',
        engines: 'DesignCraft 0.8.0 + PhotoCraft 0.9.0',
        proof: '版式与数据集合成接口就绪（注：FigCraft 未安装，不涉 UI 组件）',
        exclusions: '不含在线 SaaS 编辑器开发、客户团队驻场培训',
        defaultAccept: '用 3 组不同长短的样例数据套版生成，字段全部落位且无文字压边'
      },
      en: {
        title: 'Reusable Data-Driven Layout Templates',
        tierLabel: 'Tier C · Custom Sample',
        audience: 'Merchants with recurring promos; swap CSV rows to generate matching visuals',
        deliverables: 'Template source + replacement guide.md + 3 generated sample sets',
        engines: 'DesignCraft 0.8.0 + PhotoCraft 0.9.0',
        proof: 'Layout & dataset merge ready (Note: FigCraft is not installed)',
        exclusions: 'Excludes web SaaS editor development, on-site staff training',
        defaultAccept: 'Verified across 3 sample datasets with zero text overflow or missing glyphs'
      }
    },
    {
      id: 'S12',
      tier: 'C',
      batch: 3,
      preset: 'custom',
      zh: {
        title: '门店海报与活动延展物料',
        tierLabel: 'C · 工具已装·定制试样',
        audience: '门店开业、展会、社群活动；一版主视觉延展为印刷海报与社媒尺寸组',
        deliverables: '印刷 PDF + 社媒 PNG 组 (IG/小红书/海报) + 页面渲染预览',
        engines: 'DesignCraft 0.8.0 → PdfCraft 0.8.0',
        proof: 'DesignCraft 25 项版式命令已装',
        exclusions: '不含原创手绘插画、广告词全案策划、印刷厂实地看样',
        defaultAccept: '尺寸规格准确，字体完整嵌入，附带二维码实测可扫码跳转'
      },
      en: {
        title: 'Store Poster & Event Collateral Pack',
        tierLabel: 'Tier C · Custom Sample',
        audience: 'Store launches & events; adapt one key visual across print PDF & social sizes',
        deliverables: 'Print PDF + Social PNG set + rendered page previews',
        engines: 'DesignCraft 0.8.0 → PdfCraft 0.8.0',
        proof: 'DesignCraft 25 layout tools installed',
        exclusions: 'Excludes custom illustration, ad copywriting agency work, press check',
        defaultAccept: 'Exact dimensions, embedded fonts, QR codes tested and scannable'
      }
    },
    {
      id: 'S13',
      tier: 'C',
      batch: 4,
      preset: 'custom',
      zh: {
        title: '5–15 秒品牌动态图形片头',
        tierLabel: 'C · 工具已装·定制试样',
        audience: '视频号、播客与发布会；把矢量标志做成带透明通道的简短片头动效',
        deliverables: '带 Alpha 通道视频 + H.264 MP4 + 3 张关键帧 PNG',
        engines: 'EffectCraft 0.10.0 → FilmCraft 0.8.0',
        proof: 'EffectCraft 0.10.0 关键帧渲染就绪',
        exclusions: '不含三维角色动画、商业粒子插件授权、原创配乐作曲',
        defaultAccept: '帧率时长准确，Alpha 透明通道有效，抽检 3 帧无黑帧撕裂'
      },
      en: {
        title: '5–15s Brand Motion Graphic Bumper',
        tierLabel: 'Tier C · Custom Sample',
        audience: 'Video channels & events; animate your vector mark into an alpha-channel intro',
        deliverables: 'Alpha-channel video + H.264 MP4 + 3 keyframe PNGs',
        engines: 'EffectCraft 0.10.0 → FilmCraft 0.8.0',
        proof: 'EffectCraft 0.10.0 keyframe engine installed',
        exclusions: 'Excludes 3D character animation, paid particle plugins, original music score',
        defaultAccept: 'Exact frame rate & duration, verified alpha channel, 3 keyframes checked'
      }
    }
  ];

  // ── 预设快捷填充（点击首屏胶囊或拓扑图按钮时填入） ──────────────
  const PRESETS = {
    menu: {
      category: 'S03',
      scale: 'sample',
      zh: {
        idea: '我在悉尼开一家手工水饺店（三鲜手作），需要把 18 道水饺与小菜清单排成一份 A4 印刷菜单 PDF 和手机阅读版 PDF，保留可编辑 Word 源文件。',
        accept: '18 道菜品名称与 AUD 价格与原表 100% 一致，全文可搜索复制，首屏渲染图无文字溢出或孤行。'
      },
      en: {
        idea: 'I run a handmade dumpling shop in Sydney and need our 18-item dish & side list typeset into an A4 print menu PDF, a mobile screen PDF, plus the editable Word source.',
        accept: 'All 18 dish names and AUD prices match our source sheet 100%, text is searchable, and the page preview shows zero overflow.'
      }
    },
    brand: {
      category: 'S02',
      scale: 'sample',
      zh: {
        idea: '新消费品牌开业，已有基础标志草稿，需要制作标准矢量 SVG、印刷预览 PDF 以及 1024/512/256 三档透明背景 PNG 标志包，并附色值表。',
        accept: 'SVG 放大 4000% 无锯齿，PNG 透明通道干净无灰边，色值与规范文档完全一致。'
      },
      en: {
        idea: 'Launching a new retail brand. Need our mark produced as a clean SVG vector, print-ready PDF, and 1024/512/256 transparent PNGs with a hex color spec sheet.',
        accept: 'SVG scales cleanly at 4000%, PNGs have clean alpha transparency with no halo, hex values match spec.'
      }
    },
    site: {
      category: 'S14',
      scale: 'sample',
      zh: {
        idea: '为我们的手工水饺品牌做一页式中英双语互动展示与接单网站，包含菜品筛选、规格选择、下单抽屉，以及可下载的 PDF 菜单与标志资产。',
        accept: '线上预览地址返回 HTTP 200，390px 手机屏幕无横向滚动条，中英文切换与下单流程完整可用。'
      },
      en: {
        idea: 'Build a bilingual single-page interactive showcase and order site for our handmade dumpling brand, including menu filters, order drawer, and downloadable PDF menu.',
        accept: 'Live preview URL returns HTTP 200, zero horizontal scroll on 390px mobile, bilingual switch and order flow work end-to-end.'
      }
    },
    custom: {
      category: 'S01',
      scale: 'small',
      zh: {
        idea: '门店新拍了 60 张菜品照片，光线偏暗且尺寸不一，需要统一暖色调色、裁切为 Instagram 与菜单所需比例，并导出 1080/1600/2048 三档 WebP 与对照表。',
        accept: '抽检 10% 照片无色带或过曝，导出文件数量与 manifest.csv 行数及尺寸 100% 吻合。'
      },
      en: {
        idea: 'We shot 60 new dish photos with uneven lighting. Need unified warm color grading, cropping for social & menu use, and export to 1080/1600/2048 WebP with a manifest.',
        accept: '10% visual sample shows zero color banding, and file count plus dimensions match manifest.csv 100%.'
      }
    }
  };

  // ── i18n Engine ──────────────────────────────────────────
  function getZHEnMap(root) {
    root = root || document;
    return root.querySelectorAll('[data-zh][data-en]');
  }

  function applyLang(lang) {
    currentLang = lang;
    document.documentElement.setAttribute('data-lang', lang);
    document.documentElement.setAttribute('lang', lang === 'zh' ? 'zh-Hans' : 'en');

    document.querySelectorAll('[data-lang-btn]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-lang-btn') === lang);
    });

    getZHEnMap(document).forEach((el) => {
      // 不覆盖动态注入回执的文本
      if (el.id === 'receiptMessage' || el.id === 'trackerResultBox') return;
      const text = el.getAttribute(lang === 'zh' ? 'data-zh' : 'data-en');
      if (text !== null && text !== '') el.textContent = text;
    });

    // Placeholders
    document.querySelectorAll('[data-placeholder-zh][data-placeholder-en]').forEach((el) => {
      el.setAttribute('placeholder', el.getAttribute(lang === 'zh' ? 'data-placeholder-zh' : 'data-placeholder-en'));
    });

    // Re-render dynamic content
    renderServiceGrid();
    if (!document.getElementById('topologySvg').dataset.initialized) {
      renderTopology();
    } else {
      renderTopology();
    }
  }

  function toggleLang() {
    applyLang(currentLang === 'zh' ? 'en' : 'zh');
  }

  function t(key) {
    return (currentLang === 'zh' && key.zh) || (currentLang === 'en' && key.en) || key.zh || key.en || '';
  }

  // ── Commission Desk State & Two-Step Gate ───────────────────
  const el = (id) => document.getElementById(id);
  const ideaInput = el('ideaInput');
  const categorySelect = el('categorySelect');
  const scaleSelect = el('scaleSelect');
  const acceptanceInput = el('acceptanceInput');
  const skillSelect = el('skillSelect');
  const deliverySelect = el('deliveryChannel');
  const apiKeyInput = el('apiKeyInput');
  const webhookInput = el('webhookInput');
  const summaryIdea = el('summaryIdeaText');
  const summaryService = el('summaryServiceText');
  const summaryAccept = el('summaryAcceptText');
  const summaryDeliverables = el('summaryDeliverables');
  const summaryExclusions = el('summaryExclusions');
  const receiptBox = el('orderReceipt');
  const receiptModeBadge = el('receiptModeBadge');
  const receiptOrderId = el('receiptOrderId');
  const receiptStatus = el('receiptStatus');
  const receiptArtifactUrl = el('receiptArtifactUrl');
  const receiptMessage = el('receiptMessage');
  const stepBadge = el('stepBadge');

  function setStepVisible(visible) {
    el('step1Pane').hidden = !visible;
    el('step2Pane').hidden = visible;
    if (visible) {
      stepBadge.setAttribute('data-zh', '第 1 步 / 共 2 步：提交内容');
      stepBadge.setAttribute('data-en', 'Step 1 of 2: Submit Brief');
    } else {
      stepBadge.setAttribute('data-zh', '第 2 步 / 共 2 步：确认开工条件');
      stepBadge.setAttribute('data-en', 'Step 2 of 2: Confirm Start Conditions');
    }
    applyLang(currentLang);
  }

  function applyPreset(key) {
    const p = PRESETS[key] || PRESETS.menu;
    const content = p[currentLang] || p.zh;
    ideaInput.value = content.idea;
    acceptanceInput.value = content.accept;
    categorySelect.value = p.category;
    scaleSelect.value = p.scale;
    ideaInput.focus();
  }

  function selectedService() {
    const val = categorySelect.value;
    return SERVICES.find((s) => s.id === val) || null;
  }

  function buildSummary() {
    const svc = selectedService();
    const loc = svc ? svc[currentLang] : null;
    summaryIdea.textContent = ideaInput.value.trim() || '—';
    summaryAccept.textContent = acceptanceInput.value.trim() || (loc ? loc.defaultAccept : '—');
    summaryService.textContent = svc
      ? `${svc.id} · ${loc.title} · ${loc.tierLabel}`
      : currentLang === 'zh' ? '定制创意委托（站长人工评估）' : 'Custom Creative Commission';

    const scaleLabels = {
      sample: { zh: '第一阶段：首件样品试制', en: 'Stage 1: Sample Run' },
      small: { zh: '第二阶段：小批量订单 (2–10 件)', en: 'Stage 2: Small Batch (2–10)' },
      batch: { zh: '第三阶段：经样品校准后的批量交付', en: 'Stage 3: Batch Post-Sample' }
    };
    const sl = t(scaleLabels[scaleSelect.value] || scaleLabels.sample);

    summaryDeliverables.textContent = loc
      ? `${loc.deliverables}｜${sl}`
      : sl;

    summaryExclusions.textContent = loc
      ? loc.exclusions
      : (currentLang === 'zh'
        ? '不接违反品牌方向或未经授权的生产线；样品确认前不盲目放大产量。'
        : 'We skip unauthorized use cases and will not scale production before sample sign-off.');
  }

  // ── Topology Graph: Deterministic Render from Real Inventory ─
  function renderTopology() {
    const svg = el('topologySvg');
    if (!svg) return;
    svg.dataset.initialized = '1';
    svg.innerHTML = '';

    const W = 960;
    const H = 460;
    const cX = { A: 130, B: 400, C: 670, D: 880 };

    // Columns
    const heads = [
      { x: cX.A, zh: '你说出的话与原始素材', en: 'Your Words & Raw Assets' },
      { x: cX.B, zh: '委托合同与规格转换', en: 'Commission & Spec Conversion' },
      { x: cX.C, zh: '后台真实生产工具 (CLI)', en: 'Backstage Real CLI Engines' },
      { x: cX.D, zh: '独立验收与交付物', en: 'Verification & Deliverables' }
    ];

    heads.forEach((h) => {
      const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('x', h.x);
      txt.setAttribute('y', 26);
      txt.setAttribute('fill', '#9ca3af');
      txt.setAttribute('font-size', '11');
      txt.setAttribute('font-weight', '700');
      txt.setAttribute('text-anchor', 'middle');
      txt.textContent = h[currentLang];
      svg.appendChild(txt);
    });

    // Nodes by column
    const nodeLists = {
      A: [
        { id: 'zh-menu', label: { zh: '18 道菜 + AUD 价格', en: '18 Dishes + AUD Prices' }, y: 120 },
        { id: 'zh-brand', label: { zh: '标志草稿 / 偏好色', en: 'Mark Sketch / Color' }, y: 240 },
        { id: 'zh-photo', label: { zh: '60 张门店实拍', en: '60 Shop Photos' }, y: 360 }
      ],
      B: [
        { id: 'spec-doc', label: { zh: '规格书 + order.yml', en: 'Spec + order.yml' }, y: 120 },
        { id: 'spec-brand', label: { zh: '矢量规格 + 验收尺', en: 'Vector Spec + QA' }, y: 240 },
        { id: 'spec-photo', label: { zh: '尺寸清单 + 风参', en: 'Size List + Ref' }, y: 360 }
      ],
      C: [
        { id: 'wordcraft', label: { zh: 'WordCraft 0.7.0', en: 'WordCraft 0.7.0' }, y: 60, tier: 'V' },
        { id: 'vectorcraft', label: { zh: 'VectorCraft 0.11.0', en: 'VectorCraft 0.11.0' }, y: 140, tier: 'V' },
        { id: 'pdfcraft', label: { zh: 'PdfCraft 0.8.0', en: 'PdfCraft 0.8.0' }, y: 220, tier: 'V' },
        { id: 'photocraft', label: { zh: 'PhotoCraft 0.9.0', en: 'PhotoCraft 0.9.0' }, y: 300, tier: 'F' },
        { id: 'lightcraft', label: { zh: 'LightCraft 0.8.0', en: 'LightCraft 0.8.0' }, y: 380, tier: 'C' },
        { id: 'gridcraft', label: { zh: 'GridCraft 0.7.0', en: 'GridCraft 0.7.0' }, y: 440, tier: 'F' }
      ],
      D: [
        { id: 'out-menu', label: { zh: 'menu.pdf 73KB', en: 'menu.pdf 73KB' }, y: 60, tier: 'V' },
        { id: 'out-brand', label: { zh: 'logo.pdf 20.7KB', en: 'logo.pdf 20.7KB' }, y: 140, tier: 'V' },
        { id: 'out-webp', label: { zh: 'WebP 三档 + manifest', en: '3x WebP + Manifest' }, y: 300, tier: 'F' },
        { id: 'out-xlsx', label: { zh: 'Recalc .xlsx + Report', en: 'Recalc .xlsx + Report' }, y: 440, tier: 'F' }
      ]
    };

    // Define node renderer
    function nodeBox(x, y, label, id, tier, isTool) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('data-id', id);
      g.style.cursor = 'pointer';

      const w = isTool ? 148 : 168;
      const h = 38;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x - w / 2);
      rect.setAttribute('y', y - h / 2);
      rect.setAttribute('width', w);
      rect.setAttribute('height', h);
      rect.setAttribute('rx', 6);

      let fill = 'rgba(25,29,36,0.95)';
      let stroke = 'rgba(255,255,255,0.14)';
      if (isTool) {
        stroke = tier === 'V' ? '#10b981' : tier === 'F' ? '#0ea5e9' : '#6b7280';
        fill = tier === 'V' ? 'rgba(16,185,129,0.10)' : tier === 'F' ? 'rgba(14,165,233,0.10)' : 'rgba(107,114,128,0.08)';
      }
      rect.setAttribute('fill', fill);
      rect.setAttribute('stroke', stroke);
      rect.setAttribute('stroke-dasharray', tier === 'F' || tier === 'C' ? '4 3' : 'none');

      const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('x', x);
      txt.setAttribute('y', y + 4);
      txt.setAttribute('fill', '#f3f0e8');
      txt.setAttribute('font-size', '12');
      txt.setAttribute('font-weight', '600');
      txt.setAttribute('text-anchor', 'middle');
      txt.textContent = label;

      g.appendChild(rect);
      g.appendChild(txt);
      g.addEventListener('click', () => inspectNode(id));
      return g;
    }

    // Link rules with tier states
    const links = [
      ['zh-menu', 'spec-doc', 'V'],
      ['zh-brand', 'spec-brand', 'V'],
      ['zh-photo', 'spec-photo', 'F'],
      ['spec-doc', 'wordcraft', 'V'],
      ['wordcraft', 'out-menu', 'V'],
      ['spec-doc', 'pdfcraft', 'V'],
      ['pdfcraft', 'out-menu', 'V'],
      ['spec-brand', 'vectorcraft', 'V'],
      ['vectorcraft', 'out-brand', 'V'],
      ['spec-photo', 'photocraft', 'F'],
      ['spec-photo', 'lightcraft', 'C'],
      ['photocraft', 'out-webp', 'F'],
      ['lightcraft', 'out-webp', 'C'],
      ['spec-photo', 'gridcraft', 'F'],
      ['gridcraft', 'out-xlsx', 'F']
    ];

    // Draw links first
    links.forEach(([from, to, tier]) => {
      const a = findNode(from);
      const b = findNode(to);
      if (!a || !b) return;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const mx = (a.x + b.x) / 2;
      const d = `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', tier === 'V' ? '#10b981' : '#0ea5e9');
      path.setAttribute('stroke-width', tier === 'V' ? 1.6 : 1.3);
      if (tier !== 'V') path.setAttribute('stroke-dasharray', '5 4');
      path.style.opacity = tier === 'V' ? 0.85 : 0.5;
      svg.appendChild(path);
    });

    function findNode(id) {
      for (const col of Object.values(nodeLists)) {
        for (const n of col) {
          if (n.id === id) {
            const x = id.startsWith('zh') ? cX.A : id.startsWith('spec') ? cX.B : id.startsWith('out') ? cX.D : cX.C;
            return { x, y: n.y };
          }
        }
      }
      return null;
    }

    // Draw nodes
    Object.keys(nodeLists).forEach((colKey) => {
      const x = cX[colKey];
      nodeLists[colKey].forEach((n) => {
        const isTool = colKey === 'C' || (colKey === 'D' && n.tier === 'V');
        svg.appendChild(nodeBox(x, n.y, n.label[currentLang], n.id, colKey === 'C' ? n.tier : (n.tier || ''), isTool));
      });
    });

    function inspectNode(id) {
      const svcMap = {
        'wordcraft': 'S03', 'pdfcraft': 'S03', 'vectorcraft': 'S02',
        'photocraft': 'S01', 'lightcraft': 'S01', 'gridcraft': 'S04',
        'out-menu': 'S03', 'out-brand': 'S02', 'out-webp': 'S01', 'out-xlsx': 'S04',
        'zh-menu': 'S03', 'zh-brand': 'S02', 'zh-photo': 'S01'
      };
      const sId = svcMap[id];
      const svc = SERVICES.find((s) => s.id === sId);
      if (svc) showInspector(svc);
    }
  }

  function showInspector(svc) {
    const loc = svc[currentLang];
    const tierTag = el('inspTier');
    tierTag.textContent = loc.tierLabel;
    tierTag.className = `inspector-tier ${svc.tier === 'V' ? 'v-tag' : svc.tier === 'F' ? 'f-tag' : 'c-tag'}`;
    el('inspCode').textContent = `Service ${svc.id} · Batch ${svc.batch}`;
    el('inspTitle').textContent = loc.title;
    el('inspDesc').textContent = loc.audience;

    const kvList = el('inspKvList');
    kvList.innerHTML = `
      <div class="insp-kv">
        <span>${currentLang === 'zh' ? '核心交付物' : 'Deliverables'}</span>
        <strong>${loc.deliverables}</strong>
      </div>
      <div class="insp-kv">
        <span>${currentLang === 'zh' ? '真实生产工具' : 'Engines'}</span>
        <strong>${loc.engines}</strong>
      </div>
      <div class="insp-kv">
        <span>${currentLang === 'zh' ? '验收标准' : 'Acceptance'}</span>
        <strong>${loc.defaultAccept}</strong>
      </div>
      <div class="insp-kv">
        <span>${currentLang === 'zh' ? '不覆盖边界' : 'Out of Scope'}</span>
        <strong>${loc.exclusions}</strong>
      </div>
      <div class="insp-kv">
        <span>${currentLang === 'zh' ? '样品实证' : 'Proof'}</span>
        <strong>${loc.proof}</strong>
      </div>
    `;
    el('inspUseBtn').dataset.preset = svc.preset || 'custom';
  }

  // ── Service Catalog Rendering ──────────────────────────
  function renderServiceGrid() {
    const grid = el('serviceGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const filtered = SERVICES.filter((s) => {
      if (currentCatalogFilter === 'all') return true;
      return s.tier === currentCatalogFilter;
    });

    filtered.forEach((svc) => {
      const loc = svc[currentLang];
      const card = document.createElement('article');
      card.className = `service-card tier-${svc.tier}`;
      card.innerHTML = `
        <div class="sc-top">
          <span class="sc-id">${svc.id} · Batch ${svc.batch}</span>
          <span class="chip-tag ${svc.tier === 'V' ? 'v-tag' : svc.tier === 'F' ? 'f-tag' : 'c-tag'}">${loc.tierLabel}</span>
        </div>
        <h3 class="sc-title">${loc.title}</h3>
        <p class="sc-audience">${loc.audience}</p>
        <div class="sc-meta">
          <div class="sc-meta-row"><span>${currentLang === 'zh' ? '交付物' : 'Deliverables'}</span><strong>${loc.deliverables}</strong></div>
          <div class="sc-meta-row"><span>${currentLang === 'zh' ? '真实工具' : 'Engines'}</span><strong>${loc.engines}</strong></div>
          <div class="sc-meta-row"><span>${currentLang === 'zh' ? '样品证据' : 'Proof'}</span><strong>${loc.proof}</strong></div>
        </div>
        <div class="sc-actions">
          <button type="button" class="sc-btn" data-commission="${svc.id}">
            ${currentLang === 'zh' ? '发起这项委托 ↑' : 'Commission This Service ↑'}
          </button>
        </div>
      `;
      grid.appendChild(card);
    });

    grid.querySelectorAll('[data-commission]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-commission');
        const svc = SERVICES.find((s) => s.id === id);
        if (svc && svc.preset) applyPreset(svc.preset);
        if (svc) categorySelect.value = svc.id;
        document.getElementById('commission').scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  // ── Order Gateway Integration (Real Connectivity Probe) ──────
  async function probeGateway() {
    const dot = el('gatewayDot');
    const label = el('gatewayLabel');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${GATEWAY_BASE}/healthz`, { method: 'GET', signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        dot.classList.add('online');
        label.setAttribute('data-zh', '订单网关：真实在线（可带 Key 直接落单）');
        label.setAttribute('data-en', 'Order Gateway: Live (Keyed Orders Enabled)');
        applyLang(currentLang);
      } else {
        throw new Error('Non-200');
      }
    } catch (e) {
      dot.classList.remove('online');
      label.setAttribute('data-zh', '订单网关：暂停/限流（改为标准委托单交核收）');
      label.setAttribute('data-en', 'Order Gateway: Delayed (Manual Ticket Mode)');
      applyLang(currentLang);
    }
  }

  async function submitToGateway(orderBody) {
    const key = apiKeyInput.value.trim();
    const isAdvanced = currentMode === 'advanced';
    const delivery = isAdvanced ? deliverySelect.value : 'artifact';

    const body = {
      command: orderBody.command,
      raw: orderBody.raw,
      delivery: delivery
    };

    if (isAdvanced && (delivery === 'webhook' || delivery === 'both')) {
      const wh = webhookInput.value.trim();
      if (!wh) {
        alert(currentLang === 'zh' ? '选择 Webhook 交付时，请填写有效的接收地址。' : 'Webhook URL is required for webhook/both delivery.');
        return null;
      }
      body.webhook_url = wh;
    }

    const headers = { 'content-type': 'application/json' };
    if (key.startsWith('sk-xc-')) {
      headers.authorization = `Bearer ${key}`;
    }

    try {
      const res = await fetch(`${GATEWAY_BASE}/orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      return { ok: false, status: 0, data: { error: String(e.message || e) } };
    }
  }

  function buildOrderBodyPayload() {
    const svc = selectedService();
    const svcId = svc ? svc.id : 'CUSTOM';
    const spec = `[${svcId}] ${scaleSelect.value} | ${currentLang === 'zh' ? '验收标准' : 'Acceptance'}: ${acceptanceInput.value}`;
    const raw = ideaInput.value.trim();
    return { command: spec, raw };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const submitBtn = el('submitOrderBtn');
    submitBtn.disabled = true;
    const originalLabel = submitBtn.textContent;
    submitBtn.textContent = currentLang === 'zh' ? '正在提交并登记...' : 'Submitting & Logging...';

    const body = buildOrderBodyPayload();
    const key = apiKeyInput.value.trim();
    const hasKey = key.startsWith('sk-xc-');

    // 严格按产品理念：没有凭据也不阻断委托，改为生成标准委托单包，标为人工核收模式。
    const payload = {
      commission_id: `COM-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random()
        .toString(36)
        .slice(2, 7)
        .toUpperCase()}`,
      service_id: categorySelect.value,
      stage: scaleSelect.value,
      channel: currentMode === 'advanced' ? deliverySelect.value : 'artifact',
      skill: currentMode === 'advanced' ? skillSelect.value : 'auto',
      gateway_target: GATEWAY_BASE,
      created_at: new Date().toISOString(),
      ...body
    };

    let gatewayResp = null;
    if (hasKey) {
      gatewayResp = await submitToGateway(payload);
    }

    // 本地委托单留存（本地优先，隐私安全）
    try {
      const store = JSON.parse(localStorage.getItem('xconnect_orders') || '[]');
      store.unshift(payload);
      localStorage.setItem('xconnect_orders', JSON.stringify(store.slice(0, 20)));
    } catch (err) {
      console.warn('Local storage unavailable:', err);
    }

    receiptBox.hidden = false;
    receiptBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    if (hasKey && gatewayResp && gatewayResp.ok) {
      lastOrderId = gatewayResp.data.order_id;
      receiptOrderId.textContent = lastOrderId;
      receiptStatus.textContent = gatewayResp.data.status || 'accepted';
      receiptArtifactUrl.textContent = `/a/${lastOrderId}`;
      receiptModeBadge.setAttribute('data-zh', '已真实落库至 api.x-connect.ai');
      receiptModeBadge.setAttribute('data-en', 'Persisted Live to api.x-connect.ai');
      receiptMessage.textContent =
        currentLang === 'zh'
          ? '委托已通过网关真实登记。进入排产后，你可用该订单号经 GET /a/<id> 或小程序自提成果。'
          : 'Commission is live on the gateway. Pick up artifacts later via GET /a/<id>.';
    } else {
      const manualId = payload.commission_id;
      lastOrderId = manualId;
      receiptOrderId.textContent = manualId;
      receiptStatus.textContent = 'accepted-manual';
      receiptArtifactUrl.textContent = currentLang === 'zh' ? '交由站长核收并安排生产线' : 'Routed to Station Master Queue';
      receiptModeBadge.setAttribute('data-zh', '本地委托单已生成（人工核收模式）');
      receiptModeBadge.setAttribute('data-en', 'Local Commission Ticket (Manual Dispatch)');
      receiptMessage.textContent =
        currentLang === 'zh'
          ? '未提供 sk-xc- 客户凭据，或网关调用受限。已生成标准 JSON 委托单包，由站长按「开工条件」人工核收并排产（不阻塞你的委托）。'
          : 'No sk-xc- key or gateway call blocked. A structured commission ticket is generated for station-master dispatch (your order is not blocked).';
    }
    applyLang(currentLang);
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }

  async function checkOrderNow() {
    const inputVal = el('trackOrderIdInput').value.trim();
    const orderId = inputVal || lastOrderId;
    if (!orderId) return;

    if (orderId === 'S03-menu-sample' || orderId === 'ord_dumpling_ref') {
      showTrackerResult(
        currentLang === 'zh'
          ? '✓ 已验证真实样品单 [S03 / S02 / S14 · 三鲜手作]'
          : '✓ Verified Real Sample Artifact Bundle [S03 / S02 / S14 · Dumpling House]',
        [
          currentLang === 'zh' ? '真实产物与线上预览' : 'Real Artifacts & Live URL',
          'menu.pdf (73KB, WordCraft 0.7.0) · spec.pdf (98KB) · logo.pdf (20.7KB, VectorCraft 0.11.0) · logo.png (84KB) · https://sanxian-shouzuo.onrender.com'
        ]
      );
      return;
    }

    const isGatewayId = orderId.startsWith('ord_');

    if (isGatewayId) {
      try {
        const res = await fetch(`${GATEWAY_BASE}/a/${orderId}`);
        if (res.status === 200) {
          const data = await res.json();
          showTrackerResult(
            currentLang === 'zh'
              ? `订单 ${data.order_id}：${data.status}（完成于 ${data.finished_at || '—'}）`
              : `Order ${data.order_id}: ${data.status} (finished ${data.finished_at || '—'})`,
            [
              currentLang === 'zh' ? '取货地址' : 'Pickup URL',
              `${GATEWAY_BASE}/a/${orderId}`
            ]
          );
        } else {
          showTrackerResult(
            currentLang === 'zh' ? `网关返回状态码 ${res.status}` : `Gateway responded ${res.status}`,
            [currentLang === 'zh' ? '提示' : 'Note', currentLang === 'zh' ? '若为 410 表示订单已过期（默认 7 天有效）' : '410 means artifact expired (default 7-day TTL)']
          );
        }
      } catch (e) {
        showTrackerResult(currentLang === 'zh' ? '网关查询失败' : 'Gateway lookup failed', [currentLang === 'zh' ? '错误' : 'Error', String(e.message || e)]);
      }
    } else {
      // Look up local manual commission ticket
      try {
        const store = JSON.parse(localStorage.getItem('xconnect_orders') || '[]');
        const found = store.find((o) => o.commission_id === orderId);
        if (found) {
          showTrackerResult(
            currentLang === 'zh'
              ? `本地委托单 ${found.commission_id} 已生成于 ${found.created_at}，等待站长按开工条件核收。`
              : `Local commission ticket ${found.commission_id} created at ${found.created_at}, awaiting station-master dispatch.`,
            [currentLang === 'zh' ? '规格与验收标准' : 'Spec & Acceptance', found.command]
          );
        } else {
          showTrackerResult(
            currentLang === 'zh' ? `未找到本地委托单 ${orderId}` : `Local commission ticket ${orderId} not found`,
            [currentLang === 'zh' ? '可能原因' : 'Reason', currentLang === 'zh' ? '使用了其他浏览器，或输入了网关订单号 ord_...（将自动走网关）' : 'Different browser, or entered a live ord_... ID (auto-routes to gateway)']
          );
        }
      } catch (e) {
        showTrackerResult(currentLang === 'zh' ? '本地存储不可用' : 'Local storage unavailable', [currentLang === 'zh' ? '错误' : 'Error', String(e.message || e)]);
      }
    }
  }

  function showTrackerResult(title, kv) {
    const box = el('trackerResultBox');
    box.hidden = false;
    box.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px;">${title}</div>
      ${kv ? `<div style="display:flex;gap:10px;flex-wrap:wrap;"><span style="color:var(--ink-muted)">${kv[0]}</span><code style="font-family:var(--font-mono);color:var(--ink-light)">${kv[1]}</code></div>` : ''}
    `;
  }

  // ── Event Wiring ──────────────────────────────────────────
  function initEvents() {
    el('langSwitch').addEventListener('click', toggleLang);

    document.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const key = e.currentTarget.getAttribute('data-preset');
        if (key) applyPreset(key);
      });
    });

    el('toStep2Btn').addEventListener('click', () => {
      const idea = ideaInput.value.trim();
      if (!idea) {
        ideaInput.focus();
        ideaInput.setAttribute('placeholder', currentLang === 'zh' ? '请先描述你的想法（第一必填项）' : 'Describe your idea first (required)');
        return;
      }
      // 先写入摘要文本，再切换步骤，避免任何后续重绘造成竞态
      summaryIdea.textContent = idea;
      summaryAccept.textContent = acceptanceInput.value.trim();
      setStepVisible(false);
      buildSummary();
    });

    el('backToStep1Btn').addEventListener('click', () => setStepVisible(true));

    el('commissionForm').addEventListener('submit', handleSubmit);

    el('checkOrderNowBtn').addEventListener('click', () => {
      if (lastOrderId) el('trackOrderIdInput').value = lastOrderId;
      checkOrderNow();
    });

    el('trackQueryBtn').addEventListener('click', checkOrderNow);

    el('newCommissionBtn').addEventListener('click', () => {
      receiptBox.hidden = true;
      ideaInput.value = '';
      acceptanceInput.value = '';
      setStepVisible(true);
      document.getElementById('commission').scrollIntoView({ behavior: 'smooth' });
    });

    el('loadDemoSampleBtn').addEventListener('click', () => {
      el('trackOrderIdInput').value = 'ord_dumpling_ref';
      checkOrderNow();
    });

    el('fillSampleOrderIdBtn').addEventListener('click', () => {
      el('trackOrderIdInput').value = 'S03-menu-sample';
      checkOrderNow();
    });

    // Mode tabs
    el('modeStandardBtn').addEventListener('click', () => {
      currentMode = 'standard';
      el('modeStandardBtn').classList.add('active');
      el('modeAdvancedBtn').classList.remove('active');
      el('advancedBox').hidden = true;
      el('modeStandardBtn').setAttribute('aria-selected', 'true');
      el('modeAdvancedBtn').setAttribute('aria-selected', 'false');
    });
    el('modeAdvancedBtn').addEventListener('click', () => {
      currentMode = 'advanced';
      el('modeAdvancedBtn').classList.add('active');
      el('modeStandardBtn').classList.remove('active');
      el('advancedBox').hidden = false;
      el('modeAdvancedBtn').setAttribute('aria-selected', 'true');
      el('modeStandardBtn').setAttribute('aria-selected', 'false');
    });

    // Webhook field toggling
    deliverySelect.addEventListener('change', () => {
      const val = deliverySelect.value;
      el('webhookGroup').hidden = !(val === 'webhook' || val === 'both');
    });

    // Topology filters
    document.querySelectorAll('.topo-filter').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const filter = e.currentTarget.getAttribute('data-topo');
        document.querySelectorAll('.topo-filter').forEach((b) => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        currentTopoFilter = filter;

        const presets = { S03: 'menu', S02: 'brand', S14: 'site', F_PIPE: 'custom', all: 'menu' };
        const p = PRESETS[presets[filter] || 'menu'];
        const svc = SERVICES.find((s) => s.id === (filter === 'F_PIPE' ? 'S01' : filter));
        if (svc) showInspector(svc);
        else showInspector(SERVICES.find((s) => s.id === 'S03'));
      });
    });

    // Catalog tabs
    document.querySelectorAll('.cat-tab').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tier = e.currentTarget.getAttribute('data-tier-filter');
        document.querySelectorAll('.cat-tab').forEach((b) => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        currentCatalogFilter = tier;
        renderServiceGrid();
      });
    });

    // Gateway status pill links
    el('gatewayStatusBtn').addEventListener('click', () => {
      el('track-drawer').scrollIntoView({ behavior: 'smooth' });
    });
  }

  // ── Boot ──────────────────────────────────────────────────
  function boot() {
    applyPreset('menu');
    renderServiceGrid();
    renderTopology();
    initEvents();
    applyLang('zh');
    probeGateway();
    // Dynamic clock refresh of health
    setInterval(probeGateway, 60000);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
