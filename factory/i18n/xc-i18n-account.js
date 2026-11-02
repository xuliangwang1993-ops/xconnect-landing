// Account page + assistants page strings (Setting → 账户/Account; persona settings → 小助手).
(() => { const I = window.XC_I18N; if (!I) return;
  I.addDict('zh-Hans', '简体中文', { 'nav.setting': '账户', 'nav.account': '账户', 'nav.assistants': '小助手',
    'acc.title': '账户', 'acc.info': '账户信息', 'acc.balance': '余额', 'acc.quota': '剩余额度（按类别）', 'acc.ledger': '余额变动记录（记账）', 'acc.usage': '用量', 'acc.topup': '充值', 'acc.prefs': '偏好设置',
    'set.assistants': '小助手设定', 'asst.title': '小助手', 'lounge.slot': '槽位 {n} · 去小助手页导入素材' });
  I.addDict('en', 'English', { 'nav.setting': 'Account', 'nav.account': 'Account', 'nav.assistants': 'Assistants',
    'acc.title': 'Account', 'acc.info': 'Account info', 'acc.balance': 'Balance', 'acc.quota': 'Remaining quota by category', 'acc.ledger': 'Balance history (ledger)', 'acc.usage': 'Usage', 'acc.topup': 'Top up', 'acc.prefs': 'Preferences',
    'asst.title': 'Assistants', 'lounge.slot': 'Slot {n} · import materials on the Assistants page' });
  I.apply();
})();
