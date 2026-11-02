/**
 * lounge-i18n.js — 小助手休息室的多语种
 *
 * 和门户主页（www.x-connect.ai/i18n.js）拉齐的三件事：
 *   1. 同样 8 种语言、同样的 code（en / zh-Hans / hi / es / ar / fr / pt / ru）
 *   2. 同一个存储键 xc_lang_v1 —— 在主页选了中文，进到这里还是中文，反之亦然
 *   3. 阿拉伯语切 rtl，其余 ltr
 *
 * 主页那边是「英文原文快照 → 字典替换」，因为它是手写静态 HTML。
 * 这里文案全部由 JS 模板生成，所以走 t(key) 直接取词，不需要快照。
 */

export const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'zh-Hans', label: '简体中文' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'es', label: 'Español' },
  { code: 'ar', label: 'العربية' },
  { code: 'fr', label: 'Français' },
  { code: 'pt', label: 'Português' },
  { code: 'ru', label: 'Русский' },
];

export const STORE = 'xc_lang_v1';

/* ---------- 界面文案 ---------- */
const UI = {
  brand: {
    en: 'Assistant Lounge', 'zh-Hans': '小助手休息室', hi: 'सहायक लाउंज',
    es: 'Sala de asistentes', ar: 'صالة المساعدين', fr: 'Salon des assistants',
    pt: 'Sala dos assistentes', ru: 'Комната помощников',
  },
  skip: {
    en: 'Skip', 'zh-Hans': '跳过', hi: 'छोड़ें',
    es: 'Omitir', ar: 'تخطٍّ', fr: 'Passer', pt: 'Pular', ru: 'Пропустить',
  },
  kicker: {
    en: 'SELECT A COMPANION', 'zh-Hans': '挑选一位搭档', hi: 'साथी चुनें',
    es: 'ELIGE UN COMPAÑERO', ar: 'اختر رفيقًا', fr: 'CHOISISSEZ UN COMPAGNON',
    pt: 'ESCOLHA UM COMPANHEIRO', ru: 'ВЫБЕРИТЕ НАПАРНИКА',
  },
  title: {
    en: 'Who is working with you today',
    'zh-Hans': '今天谁来陪你干活',
    hi: 'आज कौन आपके साथ काम करेगा',
    es: '¿Quién trabaja contigo hoy?',
    ar: 'من سيعمل معك اليوم',
    fr: 'Qui travaille avec vous aujourd’hui',
    pt: 'Quem trabalha com você hoje',
    ru: 'Кто сегодня работает с вами',
  },
  sub: {
    en: 'Five assistants, each owns a stretch of the road. Picking wrong costs one sentence — switch any time.',
    'zh-Hans': '五个助手，各管一段。选错的代价只是一句话，随时能换。',
    hi: 'पाँच सहायक, हर एक का अपना हिस्सा। ग़लत चुनने की क़ीमत बस एक वाक्य — कभी भी बदलें।',
    es: 'Cinco asistentes, cada uno cubre un tramo. Equivocarse cuesta una frase: cambia cuando quieras.',
    ar: 'خمسة مساعدين، لكلٍّ منها شوط. الاختيار الخاطئ يكلّف جملة واحدة — بدّل في أي وقت.',
    fr: 'Cinq assistants, chacun couvre un tronçon. Se tromper coûte une phrase — changez quand vous voulez.',
    pt: 'Cinco assistentes, cada um cobre um trecho. Errar custa uma frase — troque quando quiser.',
    ru: 'Пять помощников, у каждого свой участок. Ошибка стоит одной фразы — меняйте когда угодно.',
  },
  listLabel: {
    en: 'Assistant list', 'zh-Hans': '助手列表', hi: 'सहायक सूची',
    es: 'Lista de asistentes', ar: 'قائمة المساعدين', fr: 'Liste des assistants',
    pt: 'Lista de assistentes', ru: 'Список помощников',
  },
  role: {
    en: 'General assistant', 'zh-Hans': '通用助手', hi: 'सामान्य सहायक',
    es: 'Asistente general', ar: 'مساعد عام', fr: 'Assistant général',
    pt: 'Assistente geral', ru: 'Универсальный помощник',
  },
  back: {
    en: 'Back', 'zh-Hans': '返回', hi: 'वापस',
    es: 'Volver', ar: 'رجوع', fr: 'Retour', pt: 'Voltar', ru: 'Назад',
  },
  introLabel: {
    en: 'Opening line', 'zh-Hans': '开场白', hi: 'शुरुआती बात',
    es: 'Presentación', ar: 'المقدمة', fr: 'Entrée en matière',
    pt: 'Abertura', ru: 'Первая фраза',
  },

  optChatTitle: {
    en: 'Chat with me', 'zh-Hans': '和我聊一会儿', hi: 'मुझसे बात करें',
    es: 'Habla conmigo', ar: 'تحدّث معي', fr: 'Discuter avec moi',
    pt: 'Converse comigo', ru: 'Поговорить со мной',
  },
  optChatSub: {
    en: 'A quick talk first, get to know each other',
    'zh-Hans': '先试聊，互相了解',
    hi: 'पहले थोड़ी बात, एक-दूसरे को जानें',
    es: 'Primero una charla corta, para conocernos',
    ar: 'حديث قصير أولًا، نتعرّف على بعضنا',
    fr: 'Une courte discussion d’abord, pour se connaître',
    pt: 'Uma conversa rápida primeiro, para nos conhecermos',
    ru: 'Сначала короткий разговор — узнаем друг друга',
  },
  optFeaturesTitle: {
    en: 'What I do', 'zh-Hans': '功能介绍', hi: 'मैं क्या करता हूँ',
    es: 'Qué hago', ar: 'ما أقوم به', fr: 'Ce que je fais',
    pt: 'O que eu faço', ru: 'Что я умею',
  },
  optFeaturesSub: {
    en: 'Where I can take work off you', 'zh-Hans': '能替你干什么',
    hi: 'आपका कौन-सा काम ले सकता हूँ',
    es: 'De qué te puedo quitar trabajo',
    ar: 'أين أستطيع أن أخفّف عنك العمل',
    fr: 'Ce dont je peux vous décharger',
    pt: 'Do que posso te aliviar',
    ru: 'От чего могу избавить',
  },
  optCapabilityTitle: {
    en: 'Capabilities', 'zh-Hans': '能力介绍', hi: 'क्षमताएँ',
    es: 'Capacidades', ar: 'القدرات', fr: 'Capacités',
    pt: 'Capacidades', ru: 'Возможности',
  },
  optCapabilitySub: {
    en: 'Why I am different', 'zh-Hans': '为什么不一样',
    hi: 'मैं अलग क्यों हूँ', es: 'Por qué soy distinto',
    ar: 'لماذا أختلف', fr: 'En quoi je diffère',
    pt: 'Por que sou diferente', ru: 'Чем я отличаюсь',
  },
  wake: {
    en: 'Wake', 'zh-Hans': '唤醒', hi: 'जगाएँ',
    es: 'Despertar', ar: 'إيقاظ', fr: 'Réveiller', pt: 'Despertar', ru: 'Разбудить',
  },

  /* 功能面板 */
  featTextTitle: {
    en: 'Writing', 'zh-Hans': '文字处理', hi: 'लेखन',
    es: 'Escritura', ar: 'الكتابة', fr: 'Rédaction',
    pt: 'Redação', ru: 'Работа с текстом',
  },
  featTextBody: {
    en: 'Drafting, translation, summarizing and polishing — long documents in one pass.',
    'zh-Hans': '写作、翻译、总结润色，长文一口气读完',
    hi: 'लिखना, अनुवाद, सार और सुधार — लंबे दस्तावेज़ एक बार में।',
    es: 'Redactar, traducir, resumir y pulir: documentos largos de una pasada.',
    ar: 'صياغة وترجمة وتلخيص وتنقيح — مستندات طويلة في مرور واحد.',
    fr: 'Rédiger, traduire, résumer et peaufiner — de longs documents d’un trait.',
    pt: 'Redigir, traduzir, resumir e aprimorar — documentos longos de uma vez.',
    ru: 'Писать, переводить, сокращать и вычитывать — длинные документы за один проход.',
  },
  featFilesTitle: {
    en: 'Files', 'zh-Hans': '查询文件', hi: 'फ़ाइलें',
    es: 'Archivos', ar: 'الملفات', fr: 'Fichiers',
    pt: 'Arquivos', ru: 'Файлы',
  },
  featFilesBody: {
    en: 'Drop a file in and ask — answers come with their sources.',
    'zh-Hans': '文件丢进来直接问，答案带来源出处',
    hi: 'फ़ाइल डालें और पूछें — जवाब स्रोत के साथ।',
    es: 'Suelta un archivo y pregunta: las respuestas traen sus fuentes.',
    ar: 'أفلِت ملفًا واسأل — الإجابات مع مصادرها.',
    fr: 'Déposez un fichier et demandez — les réponses citent leurs sources.',
    pt: 'Solte um arquivo e pergunte — as respostas vêm com as fontes.',
    ru: 'Загрузите файл и спрашивайте — ответы со ссылками на источники.',
  },
  featCodeTitle: {
    en: 'Code delivery', 'zh-Hans': '编程交付', hi: 'कोड डिलीवरी',
    es: 'Entrega de código', ar: 'تسليم الكود', fr: 'Livraison de code',
    pt: 'Entrega de código', ru: 'Сдача кода',
  },
  featCodeBody: {
    en: 'From idea to runnable code — the factory ships the finished thing.',
    'zh-Hans': '从想法到能跑的代码，工厂直接出成品',
    hi: 'विचार से चलने वाले कोड तक — फ़ैक्टरी तैयार चीज़ देती है।',
    es: 'De la idea al código que corre: la fábrica entrega el producto.',
    ar: 'من الفكرة إلى كود يعمل — المصنع يسلّم المنتج جاهزًا.',
    fr: 'De l’idée au code exécutable — l’usine livre le produit fini.',
    pt: 'Da ideia ao código que roda — a fábrica entrega o produto pronto.',
    ru: 'От идеи до работающего кода — фабрика отдаёт готовый продукт.',
  },

  /* 能力面板 */
  capMemoryTitle: {
    en: 'Permanent memory', 'zh-Hans': '永久记忆', hi: 'स्थायी स्मृति',
    es: 'Memoria permanente', ar: 'ذاكرة دائمة', fr: 'Mémoire permanente',
    pt: 'Memória permanente', ru: 'Постоянная память',
  },
  capMemoryBody: {
    en: 'Everything we discussed is kept ({n} saved) — the more we talk, the better I read you.',
    'zh-Hans': '聊过的都记得（已存 {n} 条），越用越懂你',
    hi: 'जो भी बात हुई सब याद है ({n} सहेजे) — जितना बोलेंगे, उतना समझेंगे।',
    es: 'Todo lo que hablamos queda guardado ({n}): cuanto más hablamos, mejor te leo.',
    ar: 'كل ما تحدّثنا عنه محفوظ ({n}) — كلما تحدّثنا أكثر فهمتك أفضل.',
    fr: 'Tout ce dont nous parlons est gardé ({n}) — plus nous échangeons, mieux je vous lis.',
    pt: 'Tudo o que conversamos fica guardado ({n}) — quanto mais falamos, melhor te entendo.',
    ru: 'Всё, о чём говорили, сохраняется ({n}) — чем больше общаемся, тем лучше я вас понимаю.',
  },
  capLiveTitle: {
    en: 'Live Bot', 'zh-Hans': 'Live Bot', hi: 'लाइव बॉट',
    es: 'Live Bot', ar: 'بوت مباشر', fr: 'Live Bot',
    pt: 'Live Bot', ru: 'Live Bot',
  },
  capLiveBody: {
    en: 'Online around the clock, answers when you call.',
    'zh-Hans': '7×24 小时在线，随叫随到',
    hi: 'चौबीसों घंटे ऑनलाइन, जब बुलाएँ तब हाज़िर।',
    es: 'En línea las 24 horas, responde cuando lo llamas.',
    ar: 'متصل على مدار الساعة، يجيب حين تناديه.',
    fr: 'En ligne 24 h/24, il répond quand vous l’appelez.',
    pt: 'On-line 24 horas, responde quando você chama.',
    ru: 'На связи круглосуточно, отвечает по первому зову.',
  },
  capCpuTitle: {
    en: 'Four-Core CPU', 'zh-Hans': '四核 CPU', hi: 'चार-कोर CPU',
    es: 'CPU de cuatro núcleos', ar: 'معالج رباعي النوى', fr: 'CPU quadricœur',
    pt: 'CPU de quatro núcleos', ru: 'Четырёхъядерный CPU',
  },
  capCpuBody: {
    en: 'Four cores in parallel — no queue when tasks pile up.',
    'zh-Hans': '四核并行处理，多任务不排队',
    hi: 'चार कोर समानांतर — काम बढ़ने पर कतार नहीं।',
    es: 'Cuatro núcleos en paralelo: sin cola cuando se acumulan tareas.',
    ar: 'أربع نوى بالتوازي — لا انتظار عند تكدّس المهام.',
    fr: 'Quatre cœurs en parallèle — pas de file quand les tâches s’accumulent.',
    pt: 'Quatro núcleos em paralelo — sem fila quando as tarefas se acumulam.',
    ru: 'Четыре ядра параллельно — без очереди, когда задач много.',
  },
  capGpuTitle: {
    en: 'Factory · 4×4090 GPU', 'zh-Hans': 'Factory · 4×4090 GPU', hi: 'फ़ैक्टरी · 4×4090 GPU',
    es: 'Factory · 4×4090 GPU', ar: 'المصنع · 4×4090 GPU', fr: 'Factory · 4×4090 GPU',
    pt: 'Factory · 4×4090 GPU', ru: 'Factory · 4×4090 GPU',
  },
  capGpuBody: {
    en: 'When production starts, the heavy lifting goes to the factory.',
    'zh-Hans': '生产开启时，重活儿交给工厂跑',
    hi: 'उत्पादन शुरू होने पर भारी काम फ़ैक्टरी को।',
    es: 'Cuando arranca la producción, lo pesado va a la fábrica.',
    ar: 'عند بدء الإنتاج، الأعمال الثقيلة تذهب إلى المصنع.',
    fr: 'Quand la production démarre, le gros du travail part à l’usine.',
    pt: 'Quando a produção começa, o trabalho pesado vai para a fábrica.',
    ru: 'Когда запускается производство, тяжёлое уходит на фабрику.',
  },
  wakeEllipsis: { en: '…', 'zh-Hans': '…' },
};

/* ---------- 角色台词 ---------- */
/* 中文用原名，其余语言用 nameEn 当名字，台词统一给出译文 */
const PERSONA_TEXT = {
  voice: {
    name: { en: 'Duck Lee', hi: 'डक ली', es: 'Duck Lee', ar: 'دَك لي', fr: 'Duck Lee', pt: 'Duck Lee', ru: 'Дак Ли' },
    desc: {
      en: 'Sharp tongue, never drops a task.',
      'zh-Hans': '嘴上不饶人，活儿一件不落。',
      hi: 'ज़बान तेज़, काम एक भी नहीं छूटता।',
      es: 'Lengua afilada, no deja ni una tarea.',
      ar: 'لسان حاد، ولا يترك مهمة.',
      fr: 'Langue acérée, jamais une tâche oubliée.',
      pt: 'Língua afiada, não deixa tarefa alguma.',
      ru: 'Острый на язык, но ни одного дела не бросит.',
    },
    intro: {
      en: "I'm Duck Lee. Skip the small talk, get to the point.",
      'zh-Hans': '我是李黑鸭。少废话，说事。',
      hi: 'मैं डक ली हूँ। बकवास छोड़ें, सीधे बात कहें।',
      es: 'Soy Duck Lee. Sin rodeos, al grano.',
      ar: 'أنا دَك لي. بلا حشو، قل ما تريد.',
      fr: 'Je suis Duck Lee. Pas de bavardage, allons au fait.',
      pt: 'Sou Duck Lee. Sem enrolação, direto ao ponto.',
      ru: 'Я Дак Ли. Без болтовни, сразу к делу.',
    },
  },
  scribe: {
    name: { en: 'Sparky', hi: 'स्पार्की', es: 'Sparky', ar: 'سباركي', fr: 'Sparky', pt: 'Sparky', ru: 'Спарки' },
    desc: {
      en: 'The tone of three hundred warriors, and he charges alone.',
      'zh-Hans': '三千勇士的口气，一个人也敢冲。',
      hi: 'तीन सौ योद्धाओं का लहजा, अकेले भी चढ़ाई करता है।',
      es: 'Con el tono de trescientos guerreros, y ataca solo.',
      ar: 'بنبرة ثلاثمئة محارب، ويشقّ طريقه وحده.',
      fr: 'Le ton de trois cents guerriers, et il charge seul.',
      pt: 'O tom de trezentos guerreiros, e avança sozinho.',
      ru: 'Голос трёхсот воинов, и идёт в атаку один.',
    },
    intro: {
      en: "I'm Sparky. I set the formation, you just move forward.",
      'zh-Hans': '我是斯巴达。阵型我来摆，你只管往前。',
      hi: 'मैं स्पार्की हूँ। व्यूह मैं बनाऊँगा, तुम बस आगे बढ़ो।',
      es: 'Soy Sparky. Yo armo la formación, tú solo avanza.',
      ar: 'أنا سباركي. التشكيل عليّ، وأنت تقدّم فقط.',
      fr: 'Je suis Sparky. Je dispose la formation, avancez seulement.',
      pt: 'Sou Sparky. Eu monto a formação, você só avança.',
      ru: 'Я Спарки. Строй — на мне, вы просто идите вперёд.',
    },
  },
  brain: {
    name: { en: 'Forty Cents', hi: 'फ़ोर्टी सेंट्स', es: 'Forty Cents', ar: 'فورتي سِنتس', fr: 'Forty Cents', pt: 'Forty Cents', ru: 'Форти Сентс' },
    desc: {
      en: 'Rhyme or not, the beat lands first.',
      'zh-Hans': '押韵不押韵另说，节奏先跟上。',
      hi: 'तुक मिले या न मिले, लय पहले पकड़ें।',
      es: 'Rime o no, el ritmo llega primero.',
      ar: 'قافية أو لا، الإيقاع يأتي أولًا.',
      fr: 'Rime ou pas, le rythme arrive d’abord.',
      pt: 'Rime ou não, a batida vem primeiro.',
      ru: 'В рифму или нет, но ритм задаёт он.',
    },
    intro: {
      en: "I'm Forty Cents. A four-cent job, delivered like four bucks.",
      'zh-Hans': '我是四毛。四毛钱的活儿，给你办成四块。',
      hi: 'मैं फ़ोर्टी सेंट्स हूँ। चार आने का काम, चार रुपये जैसा।',
      es: 'Soy Forty Cents. Un trabajo de cuatro centavos, entregado como de cuatro dólares.',
      ar: 'أنا فورتي سِنتس. عمل بأربعة سنتات، يُنجَز كأنه بأربعة دولارات.',
      fr: 'Je suis Forty Cents. Un travail à quatre sous, livré comme à quatre dollars.',
      pt: 'Sou Forty Cents. Um trabalho de quatro centavos, entregue como de quatro dólares.',
      ru: 'Я Форти Сентс. Работа за четыре цента — сделаю как за четыре доллара.',
    },
  },
  deep: {
    name: { en: 'WuTian', hi: 'वूतियान', es: 'WuTian', ar: 'وو تيان', fr: 'WuTian', pt: 'WuTian', ru: 'У Тянь' },
    desc: {
      en: 'Slow to warm up, but when he speaks it is a conclusion.',
      'zh-Hans': '慢热，但一旦开口就是结论。',
      hi: 'धीरे खुलता है, पर बोले तो नतीजा।',
      es: 'Tarda en entrar en calor, pero cuando habla es una conclusión.',
      ar: 'بطيء في الأنس، لكن حين يتكلم فبخلاصة.',
      fr: 'Lent à s’ouvrir, mais quand il parle c’est une conclusion.',
      pt: 'Demora a se abrir, mas quando fala é uma conclusão.',
      ru: 'Медленно сходится, но заговорит — сразу вывод.',
    },
    intro: {
      en: "I'm WuTian. Think it through, then do it.",
      'zh-Hans': '我是武天。想清楚再说，说了就做。',
      hi: 'मैं वूतियान हूँ। सोचकर कहो, कहकर करो।',
      es: 'Soy WuTian. Piénsalo bien y luego hazlo.',
      ar: 'أنا وو تيان. فكّر أولًا، ثم افعل.',
      fr: 'Je suis WuTian. Réfléchissez, puis agissez.',
      pt: 'Sou WuTian. Pense bem, depois faça.',
      ru: 'Я У Тянь. Сначала продумай, потом делай.',
    },
  },
  admin: {
    name: { en: 'Feifei', hi: 'फ़ेइफ़ेइ', es: 'Feifei', ar: 'فِي فِي', fr: 'Feifei', pt: 'Feifei', ru: 'Фэйфэй' },
    desc: {
      en: 'Plenty of sparks, quick hands, now and then off course.',
      'zh-Hans': '灵光多，手脚快，偶尔跑偏。',
      hi: 'बहुत सी चिंगारियाँ, तेज़ हाथ, कभी-कभी भटक भी जाता है।',
      es: 'Muchas chispas, manos rápidas, de vez en cuando se desvía.',
      ar: 'شرارات كثيرة، يدان سريعتان، وأحيانًا يحيد قليلًا.',
      fr: 'Beaucoup d’étincelles, des mains rapides, parfois à côté de la route.',
      pt: 'Muitas faíscas, mãos rápidas, às vezes sai do rumo.',
      ru: 'Много идей, быстрые руки, иногда сбивается с курса.',
    },
    intro: {
      en: "I'm Feifei. Start first, fix while running.",
      'zh-Hans': '我是狒狒。先干起来，边干边修。',
      hi: 'मैं फ़ेइफ़ेइ हूँ। पहले शुरू करो, चलते-चलते सुधारो।',
      es: 'Soy Feifei. Empiezo primero y corrijo mientras ando.',
      ar: 'أنا فِي فِي. ابدأ أولًا، وأصلح أثناء الجري.',
      fr: 'Je suis Feifei. On démarre, on corrige en courant.',
      pt: 'Sou Feifei. Começo primeiro, conserto enquanto ando.',
      ru: 'Я Фэйфэй. Сначала начну, потом поправлю на ходу.',
    },
  },
};

/* ---------- 当前语言 ---------- */

let current = 'en';
const listeners = new Set();

function normalize(code) {
  return LANGS.some((l) => l.code === code) ? code : 'en';
}

export function getLang() {
  return current;
}

export function isRTL() {
  return current === 'ar';
}

/** 读同域 cookie。门户在 www.x-connect.ai 写 .x-connect.ai 域，这里就能读到。 */
function cookieLang() {
  const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + STORE + '=([^;]+)'));
  if (!m) return null;
  const v = decodeURIComponent(m[1]);
  return LANGS.some((l) => l.code === v) ? v : null;
}

function writeCookie(code) {
  // 只有挂在 .x-connect.ai 下才写得动；本地 / onrender 预览域写失败也无所谓
  document.cookie =
    STORE + '=' + encodeURIComponent(code) +
    '; Path=/; Domain=.x-connect.ai; Max-Age=' + (60 * 60 * 24 * 365) +
    '; SameSite=Lax; Secure';
}

/**
 * 读存储 → 读跨子域 cookie → 读浏览器 → 兜底英文。
 * 前两步和主页 i18n.js 的 detect() 同一套判断顺序，cookie 是补的那一层：
 * 用户在 www 选了西语，进 workbench 不能又退回中文。
 */
export function detect() {
  let saved = null;
  try { saved = localStorage.getItem(STORE); } catch {}
  if (saved && LANGS.some((l) => l.code === saved)) return saved;
  const ck = cookieLang();
  if (ck) return ck;
  const nav = (navigator.language || 'en').toLowerCase();
  if (nav.indexOf('zh') === 0) return 'zh-Hans';
  if (nav.indexOf('hi') === 0) return 'hi';
  if (nav.indexOf('es') === 0) return 'es';
  if (nav.indexOf('ar') === 0) return 'ar';
  if (nav.indexOf('fr') === 0) return 'fr';
  if (nav.indexOf('pt') === 0) return 'pt';
  if (nav.indexOf('ru') === 0) return 'ru';
  return 'en';
}

export function setLang(code) {
  current = normalize(code);
  try { localStorage.setItem(STORE, current); } catch {}
  writeCookie(current);
  document.documentElement.lang = current;
  document.documentElement.dir = current === 'ar' ? 'rtl' : 'ltr';
  document.body.dataset.lang = current;
  // 外部（别处触发）改语言时，把下拉的选中项也拉回来
  const sel = document.getElementById('lang');
  if (sel && sel.value !== current) sel.value = current;
  listeners.forEach((fn) => { try { fn(current); } catch {} });
  // Let the rest of the app (labels, chat, live voice) switch immediately.
  try { document.dispatchEvent(new CustomEvent('xc:lang', { detail: current })); } catch {}
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ---------- 取词 ---------- */

/** 界面文案。找不到就退回英文，绝不返回 undefined。 */
export function t(key, vars) {
  const row = UI[key];
  if (!row) return key;
  let s = row[current] || row.en || key;
  if (vars) {
    for (const k in vars) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
  }
  return s;
}

/** 角色名：中文用本名，其他语言用英文名。 */
export function personaName(p) {
  if (!p) return '';
  if (current === 'zh-Hans') return p.name || p.nameEn || '';
  const tr = PERSONA_TEXT[p.id] && PERSONA_TEXT[p.id].name;
  if (tr && tr[current]) return tr[current];
  return p.nameEn || p.name || '';
}

/** 角色描述（一句话性格）。 */
export function personaDesc(p) {
  if (!p) return '';
  if (current === 'zh-Hans') return p.desc || '';
  const tr = PERSONA_TEXT[p.id] && PERSONA_TEXT[p.id].desc;
  return (tr && tr[current]) || (tr && tr.en) || p.desc || '';
}

/** 角色开场白。 */
export function personaIntro(p) {
  if (!p) return '';
  if (current === 'zh-Hans') return p.intro || '';
  const tr = PERSONA_TEXT[p.id] && PERSONA_TEXT[p.id].intro;
  return (tr && tr[current]) || (tr && tr.en) || p.intro || '';
}

/** 语言下拉：和主页右上角那颗同款（select#lang.lang-select）。 */
export function buildPicker(host, onChange) {
  if (!host) return null;
  const select = document.createElement('select');
  select.id = 'lang';
  select.className = 'lang-select';
  select.setAttribute('aria-label', 'Language');
  LANGS.forEach((l) => {
    const o = document.createElement('option');
    o.value = l.code;
    o.textContent = l.label;
    select.appendChild(o);
  });
  select.value = current;
  select.addEventListener('change', () => {
    setLang(select.value);
    if (onChange) onChange(select.value);
  });
  // 插到最前面。RTL 下整条 bar 会镜像，这里保持 DOM 顺序固定，视觉由 flex 处理：
  // LTR 时下拉在「跳过」左边，RTL 时自动镜像到右边，符合阿语的阅读方向。
  host.insertBefore(select, host.firstChild);
  return select;
}