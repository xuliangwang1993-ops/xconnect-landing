import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const kb = JSON.parse(fs.readFileSync(new URL('../public/xc-tour-kb.json', import.meta.url), 'utf8'));

test('self-intro carries the required beats verbatim (zh + en)', () => {
  const zh = kb.intro.beats.map((b) => b.zh).join('');
  const en = kb.intro.beats.map((b) => b.en).join(' ');
  for (const s of ['我可以带你逛工厂、教你怎么聊天、给你看我们所有的特色功能', '我是你的导游，也是你的助手', '我是你的管家', '你的钥匙也都可以放在我这儿', '有什么不懂的你都可以来问我', '你只管跟我聊，秘书的活我来做']) assert.ok(zh.includes(s), s);
  for (const s of ["I'm your butler", 'you can keep your keys with me', "If anything's unclear, just ask me"]) assert.ok(en.toLowerCase().includes(s.toLowerCase()), s);
});

test('every beat/step cap is declared; statuses are real|demo|soon', () => {
  for (const [k, v] of Object.entries(kb.capabilities)) assert.match(v.status, /^(real|demo|soon)$/, k);
  for (const b of kb.intro.beats) assert.ok(kb.capabilities[b.cap], b.cap);
  for (const t of kb.tours) for (const s of t.steps) if (s.cap) assert.ok(kb.capabilities[s.cap], t.id + ' ' + s.cap);
});

test('tours are well-formed and bilingual; personas have zh/en openers', () => {
  const ids = new Set();
  for (const t of kb.tours) {
    assert.ok(!ids.has(t.id)); ids.add(t.id);
    new RegExp(t.match);
    assert.ok(t.steps.length);
    for (const s of t.steps) { assert.ok(s.title.zh && s.title.en && s.body.zh && s.body.en, t.id); assert.ok(s.selector || s.action, t.id); }
  }
  for (const p of Object.values(kb.personas)) assert.ok(p.opener.zh && p.opener.en && p.avatar);
  for (const k of ['organize', 'reports', 'reminders', 'tasks']) assert.ok(kb.secretary[k].length);
});
