/* en dictionary — index.html (production line / station detail / Pod dispatch / ledger / assistant).
   Keys are the exact Chinese source text (trimmed). Proper nouns, ids, paths, prices and numbers stay as-is. */
(function () {
  if (!window.XCI) return;
  var X = window.XCI;

  X.add({
    /* page chrome */
    'X-Connect Factory · 产线与 Pod 派单': 'X-Connect Factory · Production line & Pod dispatch',
    '回右门': 'Back to the right door',
    '产线 · 8 工位': 'Production line · 8 stations',
    '产线 FLOW': 'Line FLOW',
    'Pod 派单': 'Pod dispatch',
    '交接账本': 'Handoff ledger',
    '小助手': 'Assistant',
    '皮肤': 'Skin',
    '运行': 'Run',
    '数据源：craft-skills runs/ · build/refs · 工厂算力接口': 'Data sources: craft-skills runs/ · build/refs · factory compute API',

    /* stations (name + note) */
    '需求解析': 'Brief parsing',
    '素材入库': 'Asset intake',
    '脚本分镜': 'Script & storyboard',
    '画面与混音': 'Visuals & mix',
    '字幕': 'Subtitles',
    '三尺寸导出': 'Three-size export',
    '验收': 'Acceptance (QA)',
    '知识包': 'Knowledge pack',
    '把一句话拆成字段：时长、语种、尺寸、交付清单': 'Split one sentence into fields: duration, languages, sizes, deliverables list',
    '抓官网、核事实、给每个素材记来源与许可': 'Crawl the website, check facts, record source and licence for every asset',
    '把事实写成六镜，出分镜 PDF 与菜单卡': 'Write the facts into six shots; output a storyboard PDF and a menu card',
    '逐帧生成、调色、合成底乐，独立取证': 'Generate frame by frame, colour-grade, mix the backing music, collect independent evidence',
    '中英字幕、行宽与安全区校核': 'Chinese/English subtitles; line-width and safe-area checks',
    '9:16 / 1:1 / 16:9 各 30.000s，封面与角标': '9:16 / 1:1 / 16:9, 30.000 s each, with cover and corner badge',
    '解码、时长、响度、安全区、追溯链': 'Decode, duration, loudness, safe area, traceability chain',
    '把事实与菜单编成小助手可答的知识包': 'Compile the facts and menu into a knowledge pack the assistant can answer from',

    /* station detail */
    '产线起点': 'Line start',
    '起止': 'Start–end',
    '未入账': 'unrecorded',
    '3 stdlib（检索式问答桩）': '3 stdlib (retrieval-style Q&A stub)',

    /* Pod dispatch */
    'Pod 实况': 'Pod status',
    '型号': 'Model',
    '镜像': 'Image',
    '地址': 'Address',
    '开单': 'Opened',
    '计费': 'Billing',
    '卷': 'Volume',
    '无公网 IP': 'no public IP',
    '未连接': 'Not connected',
    '无数据': 'no data',
    '交付后关 pod': 'Close pod after delivery',
    'pod 没在跑': 'Pod is not running',
    '产线还有 QA 没过，先不许关单': 'Some QA checks on the line have not passed; closing the order is not allowed yet',
    '交付条件已满足；按 close_policy 由发起人关': 'Delivery conditions met; per close_policy the initiator closes the pod',
    '已记账 · 待关': 'Logged · pending close',
    '发起人已申请关单；静态站不持派单凭证，真停机在电脑上跑：': 'The initiator has requested closing; the static site never holds dispatch credentials — run the real stop on your computer: ',
    '订单 · 发起人负责关单': 'Order · initiator closes the order',
    '没有待派的单。': 'No orders waiting to be dispatched.',
    '单号': 'Order no.',
    '发起': 'Initiated by',
    '派到': 'Dispatched to',
    '关单': 'Close',
    '对账': 'Reconcile',
    '未对账': 'Not reconciled',
    '本页发起人': "This page's initiator",
    '本页发起人 · owner': "This page's initiator · owner",
    '静态站不落库；真派单在电脑上 build/06_pod.py': 'The static site does not persist data; real dispatch runs on your computer via build/06_pod.py',
    '没拿到 pod 实况。在电脑上': "Couldn't get live pod status. On your computer, run",
    '订单是「工厂发起 → 派到 pod → 交付 → 发起人关 pod」这一段的凭证。关单条件写在': 'An order is the record for the "factory initiates → dispatch to pod → deliver → initiator closes pod" stretch. The close condition is written in',
    '，账单以算力供应商官方 billing 为准，我们自己只挂一个按 $/hr 估算的参考值。': ', and the bill follows the compute vendor\'s official billing; we only attach a reference value estimated per $/hr.',
    '这段链怎么走': 'How this stretch of the chain works',
    '建单': 'Create order',
    '派单': 'Dispatch',
    '干活': 'Do the work',
    '交付': 'Deliver',
    '小助手把配方 + 一句话写成': 'The assistant writes the recipe + one sentence into',
    '读': 'reads',
    '（只读环境变量，不落盘）拉 pod 实况，与订单对账': '(environment variable only, never written to disk) to pull live pod status and reconcile it against the order',
    '03/05 两站的重活走': 'Heavy work at stations 03/05 runs on',
    '；iSH 这边只保留 06 验收': '; on the iSH side only the station-06 acceptance stays',
    '成片落': 'Finished videos land in',
    '，QA 全过才写': ', and only after all QA passes is this written:',
    '按': 'Per',
    '由发起人关 pod；': 'the initiator closes the pod;',
    '是只读 key 拒的那一步，界面上标成 pending，不假装已经关了': 'is the step the read-only key rejects — the UI marks it pending and does not pretend it has been closed',

    /* ledger */
    '站': 'Station',
    '产物 → 上游': 'Artifact → upstream',
    '闭合': 'Closed',
    '全闭合': 'All closed',
    '闭合 = 上一站 outputs 里的 sha256 与本站 inputs 记的一致。16/17 里那张缺的是': 'Closed = the sha256 in the previous station\'s outputs matches the one recorded in this station\'s inputs. The one missing among 16/17 is',
    '——它没被登记进 06_qa 的 outputs，却被 07_kb 当输入用了。这一条照实标黄，不补写。': '— it was never registered in 06_qa\'s outputs, yet 07_kb used it as an input. This one is flagged yellow as-is, not back-filled.',

    /* assistant */
    '一句话 → 配方打分 + 命中词 + 证据。本地规则匹配，不调模型。': 'One sentence → recipe score + matched keywords + evidence. Local rule matching; no model is called.',
    '三尺寸短视频': 'Short video, 3 sizes',
    '菜单板': 'Menu board',
    '扫描合同': 'Scanned contract',
    '匹配配方': 'Match recipe',
    '没有命中词，只给出最接近的一条': 'No keywords matched; showing only the closest one',
    '已实测': 'Tested',
    '骨架': 'Skeleton',
    '派到 pod': 'Dispatch to pod',
    '派单预览': 'Dispatch preview',
    '匹配到已实测配方后，小助手把话写成订单，交给': 'Once a tested recipe is matched, the assistant writes your request as an order and hands it to',
    '去对账。': 'to reconcile.',
    '。': '.',
    '30 秒宣传短视频，配中英字幕和三个社媒尺寸': '30-second promotional short video with Chinese and English subtitles and three social-media sizes',
    '门店菜单板 A3 打印，价目要能改': 'Store menu board, A3 print, prices must be editable',
    '把扫描的合同 PDF 做成可搜索文档': 'Turn the scanned contract PDF into a searchable document',
    '仓库有 dumpling-home.json / dumpling-logo.json 命令稿，未跑完整 run': 'The repo has command scripts dumpling-home.json / dumpling-logo.json; a full run has not been done',
    '工具在库（ocrmypdf/pandoc），本条线未跑': 'Tools are in the library (ocrmypdf/pandoc); this line has not been run',
    'vipsthumbnail + mogrify 用法在 references，未跑完整 run': 'vipsthumbnail + mogrify usage is in references; no full run yet',

    /* recipes (existing English names from data/recipes.js `en`) */
    '30 秒三尺寸宣传片': '30s Promo, 3 aspects',
    '门店菜单板 / 价目卡': 'Menu board',
    '扫描件 → 可搜索文档': 'Scan to doc',
    '批量图片规整': 'Image batch',

    /* run tab */
    '全链': 'Full chain',
    '构建': 'Build',
    '✗ 构建失败': '✗ Build failed',
    '产物': 'Artifacts',
    '生成': 'Generated',
    '（构建链未记录）': '(build chain not recorded)',

    /* skin tab */
    '皮肤不是调色盘，是可溯源的表皮。有': 'Skins are not palettes but traceable surfaces. With a',
    '才发': 'you get',
    '，从设计规范抄的只能标': ', while ones copied from a design spec can only be marked',
    '，浏览器现取的是': ', and ones sampled in the browser are',
    '从一张自己的图取色 → 生成本地皮肤': 'Pick colours from your own image → generate a local skin',
    '材质颗粒': 'Material grain',
    '切换材质颗粒': 'Toggle material grain',
    '当前皮肤令牌': 'Current skin tokens',
    '复制 CSS 变量': 'Copy CSS variables',
    '已复制': 'Copied',
    '复制失败': 'Copy failed',
    '本地': 'Local',
    '浏览器端 k-means 取色，未入库，刷新不保留': 'k-means colour picking in the browser; not stored, lost on refresh',
    '应用默认皮肤：primary 7C3AED / secondary FBBF24 / surface 1E293B': 'App default skin: primary 7C3AED / secondary FBBF24 / surface 1E293B',
    '从门户 crystal-x.jpg 实抽 8 色；grain 取自同一张图': '8 colours extracted from the portal\'s crystal-x.jpg; grain taken from the same image',
    '直接读 --aoi-* 令牌，未手抄': 'Read the --aoi-* tokens directly, not copied by hand',
    '直接读 --bg / --surface / --accent 令牌': 'Read the --bg / --surface / --accent tokens directly'
  });

  /* recipe keywords, display form (kept apart from the general dictionary: e.g. 字幕 is both a station name and a keyword) */
  var KWD = {
    '宣传片': 'promo video', '短视频': 'short video', '视频': 'video', '30秒': '30 s', '30 秒': '30 s',
    '字幕': 'subtitles', '三个尺寸': 'three sizes', '三尺寸': 'three sizes', '社媒': 'social media',
    '门店': 'store', '餐厅': 'restaurant', '米线': 'rice noodles', '推广': 'promotion',
    '菜单': 'menu', '价目': 'price list', '价目表': 'price list', '海报': 'poster', '门店物料': 'store materials',
    '打印': 'print', '扫描': 'scan', '可搜索': 'searchable', '合同': 'contract', '发票': 'invoice',
    '归档': 'archive', '识别': 'recognition', '批量': 'batch', '图片': 'images', '缩略图': 'thumbnails',
    '压缩': 'compression', '水印': 'watermark', '图库': 'image library', '素材': 'assets'
  };

  /* ---- rules for strings assembled at run time ---- */
  var sub = function (s) { var r = X.strict(String(s).trim()); return r == null ? null : r; };
  var rule = X.rule;

  rule(/^(\d+) 工位$/, function (m) { return m[1] + (m[1] === '1' ? ' station' : ' stations'); });
  rule(/^(\d+) 个底层工具$/, function (m) { return m[1] + ' low-level tools'; });
  rule(/^本机可跑 (.+)$/, function (m) { return 'runnable locally: ' + m[1]; });
  rule(/^入 · (\d+)$/, function (m) { return 'In · ' + m[1]; });
  rule(/^出 · (\d+)$/, function (m) { return 'Out · ' + m[1]; });
  rule(/^(.+)（实测 (.+)，门槛 (.+)）$/, function (m) {
    var a = sub(m[1]); return a == null ? null : a + ' (measured ' + m[2] + ', threshold ' + m[3] + ')';
  });
  rule(/^记分：([\s\S]+)$/, function (m) { var a = sub(m[1]); return a == null ? null : 'Score notes: ' + a; });
  rule(/^(\d+)\/(\d+) 站$/, function (m) { return m[1] + '/' + m[2] + ' stations'; });
  rule(/^(\d+)\/(\d+) 闭合$/, function (m) { return m[1] + '/' + m[2] + ' closed'; });
  rule(/^(\d+) 张未入账$/, function (m) { return m[1] + ' unrecorded'; });
  rule(/^缺 (.+)$/, function (m) { return 'Missing ' + m[1]; });
  rule(/^(\d+) GB 盘$/, function (m) { return m[1] + ' GB disk'; });
  rule(/^工厂已记 (.+)$/, function (m) { return 'Factory billed ' + m[1]; });
  rule(/^我们估约 (.+)$/, function (m) { return 'we estimate ~' + m[1]; });
  rule(/^期望 (.+) \/ 实况 (.+)$/, function (m) { return 'expected ' + m[1] + ' / live ' + m[2]; });
  rule(/^命中 (.+)$/, function (m) {
    var parts = m[1].split(' / '), out = [], i, a;
    for (i = 0; i < parts.length; i++) {
      a = KWD[parts[i]] || sub(parts[i]);
      if (a == null) return null;
      if (out.indexOf(a) < 0) out.push(a);   // '30秒' and '30 秒' both show as "30 s"
    }
    return 'Matched: ' + out.join(' / ');
  });
  rule(/^✓ (\d+) 项检查通过$/, function (m) { return '✓ ' + m[1] + ' checks passed'; });
  rule(/^(\d+) 个文件 · 内联 (\d+)$/, function (m) { return m[1] + ' files · ' + m[2] + ' inlined'; });
  rule(/^生成 (.*)$/, function (m) { return 'Generated ' + m[1]; });
  rule(/^POD · 未连接$/, function () { return 'POD · not connected'; });

  /* English synonyms for the assistant's keyword matching (only used when lang=en) */
  X.addKw({
    '宣传片': ['promo video', 'promotional video', 'trailer'],
    '短视频': ['short video', 'short-form', 'shorts', 'reel'],
    '视频': ['video'],
    '30秒': ['30second', '30sec', '30s'],
    '30 秒': ['30 second', '30-second', '30 sec', '30 s'],
    '字幕': ['subtitle', 'caption'],
    '三个尺寸': ['three size', '3 size', 'three aspect', '3 aspect'],
    '三尺寸': ['three size', '3 size', 'three aspect', '3 aspect'],
    '社媒': ['social'],
    '门店': ['store', 'shop', 'storefront'],
    '餐厅': ['restaurant', 'cafe'],
    '米线': ['noodle'],
    '推广': ['promotion', 'marketing'],
    '菜单': ['menu'],
    '价目': ['price list', 'price card', 'pricing'],
    '价目表': ['price list', 'price table'],
    '海报': ['poster'],
    '门店物料': ['store material', 'signage'],
    '打印': ['print'],
    '菜单板': ['menu board'],
    '扫描': ['scan'],
    '可搜索': ['searchable'],
    '合同': ['contract'],
    '发票': ['invoice', 'receipt'],
    '归档': ['archive'],
    '识别': ['recogni'],
    '批量': ['batch', 'bulk'],
    '图片': ['image', 'photo', 'picture'],
    '缩略图': ['thumbnail'],
    '压缩': ['compress'],
    '水印': ['watermark'],
    '图库': ['image library', 'gallery'],
    '素材': ['asset', 'footage']
  });

  /* login gate + empty states (owner-isolation change) */
  X.add({
    '登录后查看你的产线': 'Sign in to see your production line',
    '订单、Pod 与运行记录只属于你自己的账号。请用 X-connect 账号登录（与首页是同一套账号）。': 'Orders, Pods and run records belong to your own account only. Sign in with your X-connect account (the same account as the homepage).',
    '邮箱 + 密码': 'Email + password',
    '邮件验证码': 'Email code',
    '邮箱': 'Email',
    '密码': 'Password',
    '登录': 'Sign in',
    '发送验证码 / 登录链接': 'Send code / sign-in link',
    '邮件里的验证码': 'Code from the email',
    '验证并登录': 'Verify and sign in',
    '还没有账号？先到': 'No account yet? First go to',
    '注册，再回到这里登录。': 'to sign up, then come back here to sign in.',
    '退出登录': 'Sign out',
    '已登录': 'Signed in',
    '登录中…': 'Signing in…',
    '发送中…': 'Sending…',
    '验证中…': 'Verifying…',
    '已发送。点邮件里的链接，或在下面输入邮件里的验证码。': 'Sent. Click the link in the email, or enter the code from the email below.',
    '邮箱或密码不对': 'Wrong email or password',
    '邮箱还没验证，请先到邮件里确认': 'Email not verified yet; please confirm it from the email first',
    '请求太频繁，请稍后再试': 'Too many requests; please try again later',
    '这个邮箱还没有账号，请先到首页注册': 'No account for this email yet; please sign up on the homepage first',
    '验证码不对或已过期': 'Wrong or expired code',
    '网络不通，请稍后再试': 'Network error; please try again later',
    '登录失败，请稍后再试': 'Sign-in failed; please try again later',
    '还没有订单。': 'No orders yet.',
    '还没有 Pod': 'No Pods yet',
    '还没有 Pod。在电脑上': 'No Pods yet. After you run',
    '拉取后会出现在这里。': 'on your computer, they will appear here.',
    '闭合 = 上一站 outputs 里的 sha256 与本站 inputs 记的一致。': 'Closed = the sha256 in the previous station\'s outputs matches the one recorded in this station\'s inputs.',
    '还没有运行记录': 'No run records yet',
    '未入账的链接照实标黄，不补写。': 'Links that are not on the books are marked yellow as they are, not back-filled.',
    '闭合 = 上一站 outputs 里的 sha256 与本站 inputs 记的一致。未入账的链接照实标黄，不补写。': 'Closed = the sha256 in the previous station\'s outputs matches the one recorded in this station\'s inputs. Links that are not on the books are marked yellow as they are, not back-filled.',
    '数据读取失败，请刷新或重新登录': 'Could not load data; please refresh or sign in again'
  });
})();
