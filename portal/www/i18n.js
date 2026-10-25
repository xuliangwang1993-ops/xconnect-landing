/* X-connect portal — runtime i18n.
 *
 * Why runtime instead of data-i18n attributes: this page is a hand-tuned
 * static bundle with inline styles and no build step. Rewriting 30+ tags to
 * add keys risks breaking layout; swapping text nodes by their English source
 * keeps index.html byte-identical apart from the <script> tag.
 *
 * The top-right "Sign in" button becomes the language picker: auth.js guards
 * `if (s)` around #session, so removing it is safe, and the real sign-in card
 * lives in the hero (#auth) and #signup.
 *
 * Languages: top 8 by number of speakers — English, Mandarin, Hindi, Spanish,
 * Arabic, French, Portuguese, Russian.
 */
(function () {
  'use strict';

  var LANGS = [
    { code: 'en', label: 'English' },
    { code: 'zh-Hans', label: '简体中文' },
    { code: 'hi', label: 'हिन्दी' },
    { code: 'es', label: 'Español' },
    { code: 'ar', label: 'العربية' },
    { code: 'fr', label: 'Français' },
    { code: 'pt', label: 'Português' },
    { code: 'ru', label: 'Русский' }
  ];

  var DICT = {
    'Sound off': {
      'zh-Hans': '音效关', hi: 'ध्वनि बंद', es: 'Sonido off',
      ar: 'الصوت مغلق', fr: 'Son coupé', pt: 'Som off', ru: 'Звук выкл.'
    },
    'Sound on': {
      'zh-Hans': '音效开', hi: 'ध्वनि चालू', es: 'Sonido on',
      ar: 'الصوت مفعّل', fr: 'Son activé', pt: 'Som on', ru: 'Звук вкл.'
    },
    'Enable ambient sound': {
      'zh-Hans': '开启环境音效', hi: 'परिवेश ध्वनि चालू करें', es: 'Activar sonido ambiente',
      ar: 'تفعيل الصوت المحيط', fr: 'Activer le son d’ambiance', pt: 'Ativar som ambiente', ru: 'Включить фоновый звук'
    },
    'From intent': {
      'zh-Hans': '从一个念头', hi: 'मंशा से', es: 'De la intención',
      ar: 'من النية', fr: 'De l’intention', pt: 'Da intenção', ru: 'От замысла'
    },
    'to deliverable.': {
      'zh-Hans': '到可交付。', hi: 'डिलीवरेबल तक।', es: 'al entregable.',
      ar: 'إلى المُنجَز.', fr: 'au livrable.', pt: 'ao entregável.', ru: 'к результату.'
    },
    'The next industrial revolution starts here.': {
      'zh-Hans': '下一场工业革命，从这里开始。',
      hi: 'अगली औद्योगिक क्रांति यहीं से शुरू होती है।',
      es: 'La próxima revolución industrial empieza aquí.',
      ar: 'الثورة الصناعية القادمة تبدأ من هنا.',
      fr: 'La prochaine révolution industrielle commence ici.',
      pt: 'A próxima revolução industrial começa aqui.',
      ru: 'Следующая промышленная революция начинается здесь.'
    },
    'Forgot password': {
      'zh-Hans': '忘记密码', hi: 'पासवर्ड भूल गए', es: 'Olvidé mi contraseña',
      ar: 'نسيت كلمة المرور', fr: 'Mot de passe oublié', pt: 'Esqueci a senha', ru: 'Забыли пароль'
    },
    'or continue with': {
      'zh-Hans': '或使用以下方式', hi: 'या इससे जारी रखें', es: 'o continúa con',
      ar: 'أو تابع باستخدام', fr: 'ou continuer avec', pt: 'ou continue com', ru: 'или продолжить через'
    },
    'No account?': {
      'zh-Hans': '还没有账号？', hi: 'खाता नहीं है?', es: '¿Sin cuenta?',
      ar: 'ليس لديك حساب؟', fr: 'Pas encore de compte ?', pt: 'Sem conta?', ru: 'Нет аккаунта?'
    },
    'Sign up': {
      'zh-Hans': '注册', hi: 'साइन अप', es: 'Crear cuenta',
      ar: 'إنشاء حساب', fr: 'S’inscrire', pt: 'Criar conta', ru: 'Регистрация'
    },
    'Signed in as': {
      'zh-Hans': '已登录：', hi: 'साइन इन:', es: 'Sesión iniciada como',
      ar: 'مسجّل الدخول باسم', fr: 'Connecté en tant que', pt: 'Conectado como', ru: 'Вы вошли как'
    },
    'Choose a door — the assistant on the left, the production line on the right.': {
      'zh-Hans': '选一扇门 —— 左边是助手，右边是产线。',
      hi: 'एक दरवाज़ा चुनें — बाएँ सहायक, दाएँ उत्पादन लाइन।',
      es: 'Elige una puerta: el asistente a la izquierda, la línea de producción a la derecha.',
      ar: 'اختر بابًا — المساعد على اليسار، وخط الإنتاج على اليمين.',
      fr: 'Choisissez une porte : l’assistant à gauche, la chaîne de production à droite.',
      pt: 'Escolha uma porta: o assistente à esquerda, a linha de produção à direita.',
      ru: 'Выберите дверь: слева помощник, справа производственная линия.'
    },
    'Top up': {
      'zh-Hans': '充值', hi: 'टॉप अप', es: 'Recargar',
      ar: 'تعبئة الرصيد', fr: 'Recharger', pt: 'Recarregar', ru: 'Пополнить'
    },
    'Add a passkey': {
      'zh-Hans': '添加通行密钥', hi: 'पासकी जोड़ें', es: 'Añadir passkey',
      ar: 'إضافة مفتاح مرور', fr: 'Ajouter une passkey', pt: 'Adicionar passkey', ru: 'Добавить passkey'
    },
    'Sign out': {
      'zh-Hans': '退出登录', hi: 'साइन आउट', es: 'Cerrar sesión',
      ar: 'تسجيل الخروج', fr: 'Se déconnecter', pt: 'Sair', ru: 'Выйти'
    },
    'Chat': {
      'zh-Hans': '对话', hi: 'चैट', es: 'Chat',
      ar: 'الدردشة', fr: 'Chat', pt: 'Chat', ru: 'Чат'
    },
    'One-third the cost.': {
      'zh-Hans': '三分之一的成本。', hi: 'एक-तिहाई लागत।', es: 'Un tercio del coste.',
      ar: 'بثلث التكلفة.', fr: 'Un tiers du coût.', pt: 'Um terço do custo.', ru: 'Треть стоимости.'
    },
    'Three times the usage.': {
      'zh-Hans': '三倍的使用量。', hi: 'तीन गुना उपयोग।', es: 'El triple de uso.',
      ar: 'ثلاثة أضعاف الاستخدام.', fr: 'Trois fois plus d’usage.', pt: 'O triplo de uso.', ru: 'Втрое больше использования.'
    },
    'Code': {
      'zh-Hans': '写代码', hi: 'कोड', es: 'Código',
      ar: 'البرمجة', fr: 'Code', pt: 'Código', ru: 'Код'
    },
    'No infrastructure needed.': {
      'zh-Hans': '不需要自有基础设施。', hi: 'कोई इंफ़्रास्ट्रक्चर नहीं चाहिए।', es: 'Sin infraestructura propia.',
      ar: 'لا حاجة لبنية تحتية.', fr: 'Aucune infrastructure requise.', pt: 'Sem infraestrutura própria.', ru: 'Инфраструктура не нужна.'
    },
    'Your idea, delivered.': {
      'zh-Hans': '你的想法，直接交付。', hi: 'आपका आइडिया, डिलीवर।', es: 'Tu idea, entregada.',
      ar: 'فكرتك، مُنجَزة.', fr: 'Votre idée, livrée.', pt: 'Sua ideia, entregue.', ru: 'Ваша идея — сдана.'
    },
    'CREATE AN ACCOUNT': {
      'zh-Hans': '创建账号', hi: 'खाता बनाएँ', es: 'CREAR UNA CUENTA',
      ar: 'إنشاء حساب', fr: 'CRÉER UN COMPTE', pt: 'CRIAR UMA CONTA', ru: 'СОЗДАТЬ АККАУНТ'
    },
    'One account. Two doors.': {
      'zh-Hans': '一个账号，两扇门。', hi: 'एक खाता। दो दरवाज़े।', es: 'Una cuenta. Dos puertas.',
      ar: 'حساب واحد. بابان.', fr: 'Un compte. Deux portes.', pt: 'Uma conta. Duas portas.', ru: 'Один аккаунт. Две двери.'
    },
    'The assistant on the left, the production line on the right — same account, same balance.': {
      'zh-Hans': '左边助手，右边产线 —— 同一个账号，同一份余额。',
      hi: 'बाएँ सहायक, दाएँ उत्पादन लाइन — एक ही खाता, एक ही बैलेंस।',
      es: 'El asistente a la izquierda, la línea de producción a la derecha: misma cuenta, mismo saldo.',
      ar: 'المساعد على اليسار، وخط الإنتاج على اليمين — حساب واحد ورصيد واحد.',
      fr: 'L’assistant à gauche, la chaîne de production à droite — même compte, même solde.',
      pt: 'O assistente à esquerda, a linha de produção à direita — mesma conta, mesmo saldo.',
      ru: 'Слева помощник, справа производственная линия — один аккаунт, один баланс.'
    },
    'I agree to the terms of service and privacy policy.': {
      'zh-Hans': '我同意服务条款与隐私政策。',
      hi: 'मैं सेवा की शर्तों और गोपनीयता नीति से सहमत हूँ।',
      es: 'Acepto los términos del servicio y la política de privacidad.',
      ar: 'أوافق على شروط الخدمة وسياسة الخصوصية.',
      fr: 'J’accepte les conditions d’utilisation et la politique de confidentialité.',
      pt: 'Aceito os termos de serviço e a política de privacidade.',
      ru: 'Я принимаю условия обслуживания и политику конфиденциальности.'
    },
    'Create account': {
      'zh-Hans': '创建账号', hi: 'खाता बनाएँ', es: 'Crear cuenta',
      ar: 'إنشاء الحساب', fr: 'Créer un compte', pt: 'Criar conta', ru: 'Создать аккаунт'
    },
    'or': {
      'zh-Hans': '或', hi: 'या', es: 'o', ar: 'أو', fr: 'ou', pt: 'ou', ru: 'или'
    },
    'Join us': {
      'zh-Hans': '加入我们', hi: 'हमसे जुड़ें', es: 'Únete',
      ar: 'انضم إلينا', fr: 'Rejoignez-nous', pt: 'Junte-se', ru: 'Присоединяйтесь'
    },
    'Start your first commission': {
      'zh-Hans': '开始你的第一个委托', hi: 'अपना पहला कमीशन शुरू करें', es: 'Empieza tu primer encargo',
      ar: 'ابدأ أول طلب لك', fr: 'Lancez votre première commande', pt: 'Comece seu primeiro pedido', ru: 'Начните первый заказ'
    },
    '← Back to the universe': {
      'zh-Hans': '← 回到宇宙', hi: '← ब्रह्मांड पर लौटें', es: '← Volver al universo',
      ar: '← العودة إلى الكون', fr: '← Retour à l’univers', pt: '← Voltar ao universo', ru: '← Назад во вселенную'
    }
  };

  var PLACEHOLDERS = {
    'Login name': {
      'zh-Hans': '登录名', hi: 'लॉगिन नाम', es: 'Usuario',
      ar: 'اسم الدخول', fr: 'Identifiant', pt: 'Usuário', ru: 'Логин'
    },
    'Password': {
      'zh-Hans': '密码', hi: 'पासवर्ड', es: 'Contraseña',
      ar: 'كلمة المرور', fr: 'Mot de passe', pt: 'Senha', ru: 'Пароль'
    },
    'Email': {
      'zh-Hans': '邮箱', hi: 'ईमेल', es: 'Correo electrónico',
      ar: 'البريد الإلكتروني', fr: 'E-mail', pt: 'E-mail', ru: 'Эл. почта'
    },
    'Password (at least 8 characters)': {
      'zh-Hans': '密码（至少 8 位）', hi: 'पासवर्ड (कम से कम 8 अक्षर)', es: 'Contraseña (mínimo 8 caracteres)',
      ar: 'كلمة المرور (8 أحرف على الأقل)', fr: 'Mot de passe (8 caractères minimum)',
      pt: 'Senha (mínimo 8 caracteres)', ru: 'Пароль (не менее 8 символов)'
    },
    'Confirm password': {
      'zh-Hans': '确认密码', hi: 'पासवर्ड दोहराएँ', es: 'Confirmar contraseña',
      ar: 'تأكيد كلمة المرور', fr: 'Confirmer le mot de passe', pt: 'Confirmar senha', ru: 'Повторите пароль'
    }
  };

  // ---- runtime helper for JS-built strings --------------------------------

  // Dynamic copy (e.g. the quota line) is assembled in auth.js. Expose a tiny
  // lookup so those strings follow the picker without duplicating the table.
  var RUNTIME = {
    quotaFull: {
      'zh-Hans': ' · 全部权限', hi: ' · पूरा एक्सेस', es: ' · Acceso completo',
      ar: ' · وصول كامل', fr: ' · Accès complet', pt: ' · Acesso total', ru: ' · Полный доступ'
    },
    quotaLimited: {
      'zh-Hans': ' · 受限访问 —— 充值后解锁批量交付',
      hi: ' · सीमित पहुँच — बैच डिलीवरी के लिए टॉप अप करें',
      es: ' · Acceso limitado: recarga para desbloquear la entrega por lotes',
      ar: ' · وصول محدود — اشحن لفتح التسليم بالجملة',
      fr: ' · Accès limité — rechargez pour débloquer la livraison par lots',
      pt: ' · Acesso limitado — recarregue para liberar a entrega em lote',
      ru: ' · Ограниченный доступ — пополните для пакетной выдачи'
    }
  };

  var current = 'en';
  window.__xcTr = function (key, fallback) {
    var hit = RUNTIME[key];
    if (!hit || current === 'en' || !hit[current]) return fallback;
    return hit[current];
  };


  // ---- full-sentence messages built in auth.js -------------------------
  var MESSAGES = {
    'User already registered': { 'zh-Hans': '这个邮箱已经注册过了，请直接登录。', 'hi': 'यह ईमेल पहले से पंजीकृत है, कृपया साइन इन करें।', 'es': 'Ese correo ya está registrado. Inicia sesión.', 'ar': 'هذا البريد مسجّل بالفعل، سجّل الدخول.', 'fr': 'Cet e-mail est déjà enregistré. Connectez-vous.', 'pt': 'Esse e-mail já está registrado. Entre.', 'ru': 'Эта почта уже зарегистрирована. Войдите.' },
    'Invalid login credentials': { 'zh-Hans': '邮箱或密码不对。', 'hi': 'ईमेल या पासवर्ड गलत है।', 'es': 'Correo o contraseña incorrectos.', 'ar': 'البريد أو كلمة المرور غير صحيحة.', 'fr': 'E-mail ou mot de passe incorrect.', 'pt': 'E-mail ou senha incorretos.', 'ru': 'Неверная почта или пароль.' },
    'Email not confirmed': { 'zh-Hans': '邮箱还没确认。', 'hi': 'ईमेल की पुष्टि नहीं हुई।', 'es': 'Correo sin confirmar.', 'ar': 'البريد غير مؤكد.', 'fr': 'E-mail non confirmé.', 'pt': 'E-mail não confirmado.', 'ru': 'Почта не подтверждена.' },
    'Enter your email and password.': { 'zh-Hans': '请输入邮箱和密码。', 'hi': 'ईमेल और पासवर्ड दर्ज करें।', 'es': 'Introduce tu correo y contraseña.', 'ar': 'أدخل بريدك وكلمة المرور.', 'fr': 'Saisissez votre e-mail et votre mot de passe.', 'pt': 'Informe e-mail e senha.', 'ru': 'Введите почту и пароль.' },
    'Signed in.': { 'zh-Hans': '已登录。', 'hi': 'साइन इन हो गया।', 'es': 'Sesión iniciada.', 'ar': 'تم تسجيل الدخول.', 'fr': 'Connecté.', 'pt': 'Conectado.', 'ru': 'Вы вошли.' },
    'Signed out.': { 'zh-Hans': '已退出登录。', 'hi': 'साइन आउट हो गया।', 'es': 'Sesión cerrada.', 'ar': 'تم تسجيل الخروج.', 'fr': 'Déconnecté.', 'pt': 'Saiu.', 'ru': 'Вы вышли.' },
    'Type your email above first.': { 'zh-Hans': '请先在上面填写邮箱。', 'hi': 'पहले ऊपर अपना ईमेल लिखें।', 'es': 'Escribe tu correo arriba primero.', 'ar': 'اكتب بريدك أعلاه أولاً.', 'fr': 'Saisissez d’abord votre e-mail ci-dessus.', 'pt': 'Digite seu e-mail acima primeiro.', 'ru': 'Сначала введите почту выше.' },
    'Enter your email.': { 'zh-Hans': '请输入邮箱。', 'hi': 'अपना ईमेल दर्ज करें।', 'es': 'Introduce tu correo.', 'ar': 'أدخل بريدك الإلكتروني.', 'fr': 'Saisissez votre e-mail.', 'pt': 'Informe seu e-mail.', 'ru': 'Введите почту.' },
    'Password needs at least 8 characters.': { 'zh-Hans': '密码至少 8 位。', 'hi': 'पासवर्ड कम से कम 8 अक्षरों का होना चाहिए।', 'es': 'La contraseña necesita al menos 8 caracteres.', 'ar': 'كلمة المرور 8 أحرف على الأقل.', 'fr': 'Le mot de passe doit faire au moins 8 caractères.', 'pt': 'A senha precisa de 8 caracteres.', 'ru': 'Пароль должен быть не короче 8 символов.' },
    'Passwords do not match.': { 'zh-Hans': '两次密码不一致。', 'hi': 'पासवर्ड मेल नहीं खाते।', 'es': 'Las contraseñas no coinciden.', 'ar': 'كلمتا المرور غير متطابقتين.', 'fr': 'Les mots de passe ne correspondent pas.', 'pt': 'As senhas não coincidem.', 'ru': 'Пароли не совпадают.' },
    'Please accept the terms first.': { 'zh-Hans': '请先同意条款。', 'hi': 'पहले शर्तें स्वीकार करें।', 'es': 'Acepta los términos primero.', 'ar': 'وافق على الشروط أولاً.', 'fr': 'Acceptez d’abord les conditions.', 'pt': 'Aceite os termos primeiro.', 'ru': 'Сначала примите условия.' },
    'Account created. You are signed in.': { 'zh-Hans': '账号已创建，已自动登录。', 'hi': 'खाता बन गया। आप साइन इन हैं।', 'es': 'Cuenta creada. Sesión iniciada.', 'ar': 'تم إنشاء الحساب. أنت مسجّل الدخول.', 'fr': 'Compte créé. Vous êtes connecté.', 'pt': 'Conta criada. Você está conectado.', 'ru': 'Аккаунт создан. Вы вошли.' },
    'Check your inbox to confirm the address, then sign in.': { 'zh-Hans': '请查收邮件确认邮箱，然后登录。', 'hi': 'ईमेल पुष्टि के लिए इनबॉक्स देखें, फिर साइन इन करें।', 'es': 'Revisa tu correo para confirmar y luego inicia sesión.', 'ar': 'تحقق من بريدك للتأكيد ثم سجّل الدخول.', 'fr': 'Vérifiez votre boîte pour confirmer, puis connectez-vous.', 'pt': 'Confira seu e-mail para confirmar e depois entre.', 'ru': 'Проверьте почту, подтвердите адрес и войдите.' },
    'Sign in first — both doors unlock with one account.': { 'zh-Hans': '请先登录 —— 一个账号，两扇门都开。', 'hi': 'पहले साइन इन करें — एक खाता, दोनों दरवाज़े खुलते हैं।', 'es': 'Inicia sesión primero: una cuenta abre ambas puertas.', 'ar': 'سجّل الدخول أولاً — حساب واحد يفتح البابين.', 'fr': 'Connectez-vous d’abord — un compte ouvre les deux portes.', 'pt': 'Entre primeiro — uma conta abre as duas portas.', 'ru': 'Сначала войдите — один аккаунт открывает обе двери.' },
    'This browser could not run the passkey prompt.': { 'zh-Hans': '这个浏览器无法发起通行密钥验证。', 'hi': 'यह ब्राउज़र पासकी प्रॉम्प्ट नहीं चला सका।', 'es': 'Este navegador no pudo abrir el passkey.', 'ar': 'لا يمكن لهذا المتصفح تشغيل طلب مفتاح المرور.', 'fr': 'Ce navigateur n’a pas pu lancer la passkey.', 'pt': 'Este navegador não conseguiu iniciar a passkey.', 'ru': 'Браузер не смог запустить запрос passkey.' },
    'Passkey registration was cancelled.': { 'zh-Hans': '已取消通行密钥注册。', 'hi': 'पासकी पंजीकरण रद्द हुआ।', 'es': 'Registro de passkey cancelado.', 'ar': 'تم إلغاء تسجيل مفتاح المرور.', 'fr': 'Enregistrement de la passkey annulé.', 'pt': 'Registro de passkey cancelado.', 'ru': 'Регистрация passkey отменена.' }
  };
  window.__xcT2 = function (text) {
    var hit = MESSAGES[text];
    if (!hit || current === 'en' || !hit[current]) return text;
    return hit[current];
  };

  // ---- engine -------------------------------------------------------------

  var STORE = 'xc_lang_v1';
  var textNodes = [];       // {node, original}
  var placeholderEls = [];  // {el, original}

  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  function snapshot() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var p = n.parentNode && n.parentNode.nodeName;
        if (p === 'SCRIPT' || p === 'STYLE' || p === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    while ((n = walker.nextNode())) {
      if (DICT[norm(n.nodeValue)]) textNodes.push({ node: n, original: n.nodeValue });
    }
    var inputs = document.querySelectorAll('input[placeholder], textarea[placeholder]');
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      if (PLACEHOLDERS[norm(el.getAttribute('placeholder'))]) {
        placeholderEls.push({ el: el, original: el.getAttribute('placeholder') });
      }
    }
  }

  function apply(lang) {
    for (var i = 0; i < textNodes.length; i++) {
      var item = textNodes[i];
      var hit = DICT[norm(item.original)];
      if (lang === 'en' || !hit || !hit[lang]) {
        item.node.nodeValue = item.original;
      } else {
        var lead = item.original.match(/^\s*/)[0];
        var trail = item.original.match(/\s*$/)[0];
        item.node.nodeValue = lead + hit[lang] + trail;
      }
    }
    for (var j = 0; j < placeholderEls.length; j++) {
      var p = placeholderEls[j];
      var t = PLACEHOLDERS[norm(p.original)];
      p.el.setAttribute('placeholder', (lang === 'en' || !t || !t[lang]) ? p.original : t[lang]);
    }
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.body.setAttribute('data-lang', lang);
    current = lang;
    repaintQuota();
  }

  // auth.js paints the quota line once, on entitlement load. Re-paint it here
  // so switching language doesn't leave one line of English behind.
  function repaintQuota() {
    var el = document.getElementById('auth-quota');
    var d = window.__xcEntitlement;
    if (!el || !d) return;
    var yuan = (Number(d.balance_cents || 0) / 100).toFixed(2);
    el.textContent = 'Balance ¥' + yuan +
      (d.mode === 'full'
        ? window.__xcTr('quotaFull', ' · Full access')
        : window.__xcTr('quotaLimited', ' · Limited access — top up to unlock batch delivery'));
  }

  function buildPicker() {
    var host = document.querySelector('.utility');
    if (!host) return null;
    var sessionBtn = document.getElementById('session');
    var select = document.createElement('select');
    select.id = 'lang';
    select.className = 'lang-select';
    select.setAttribute('aria-label', 'Language');
    for (var i = 0; i < LANGS.length; i++) {
      var o = document.createElement('option');
      o.value = LANGS[i].code;
      o.textContent = LANGS[i].label;
      select.appendChild(o);
    }
    if (sessionBtn && sessionBtn.parentNode === host) {
      host.replaceChild(select, sessionBtn);
    } else {
      host.insertBefore(select, host.firstChild);
    }
    select.addEventListener('change', function () {
      var lang = select.value;
      try { localStorage.setItem(STORE, lang); } catch (e) {}
      apply(lang);
      document.dispatchEvent(new CustomEvent('xc:lang', { detail: { lang: lang } }));
    });
    return select;
  }

  function detect() {
    var saved = null;
    try { saved = localStorage.getItem(STORE); } catch (e) {}
    if (saved && LANGS.some(function (l) { return l.code === saved; })) return saved;
    var nav = (navigator.language || 'en').toLowerCase();
    if (nav.indexOf('zh') === 0) return 'zh-Hans';
    if (nav.indexOf('hi') === 0) return 'hi';
    if (nav.indexOf('es') === 0) return 'es';
    if (nav.indexOf('ar') === 0) return 'ar';
    if (nav.indexOf('fr') === 0) return 'fr';
    if (nav.indexOf('pt') === 0) return 'pt';
    if (nav.indexOf('ru') === 0) return 'ru';
    return 'en';
  }

  function boot() {
    snapshot();
    var select = buildPicker();
    var lang = detect();
    if (select) select.value = lang;
    apply(lang);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
