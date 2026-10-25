/* en dictionary — words shared by both pages. Keys are the exact Chinese source text. */
(function () {
  if (!window.XCI) return;
  var X = window.XCI;
  X.add({
    '产线': 'Production line',
    '工厂': 'Factory',
    '状态': 'Status',
    '运行': 'Run',
    '证据': 'Evidence',
    '配方': 'Recipe',
    '工具': 'Tools',
    '缺': 'Missing',
    '出': 'Out',
    '入': 'In',
    '已验证': 'Verified',
    '未验证': 'Unverified',
    '潜在': 'Potential',
    '阻塞': 'Blocked',
    '已过期': 'Expired',
    '只读': 'Read-only',
    '写入': 'Write',
    '破坏性': 'Destructive'
  });
  // "7 张未入账"-style counters are handled by page rules; keep generic ones here.
  X.rule(/^(\d+)\/(\d+) 项$/, function (m) { return m[1] + '/' + m[2] + ' checks'; });
  X.rule(/^(\d+) 项$/, function (m) { return m[1] + (m[1] === '1' ? ' item' : ' items'); });
})();
