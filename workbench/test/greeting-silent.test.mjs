import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const kb = JSON.parse(fs.readFileSync(new URL('../public/xc-tour-kb.json', import.meta.url), 'utf8'));
test('greeting script beats + yes/no routing words', () => {
  const g = kb.greeting;
  for (const s of ['嗨，我来了。', '我是你的助手，我是{name}。', '我是你的管家，也是你的导游', '要不要我现在带你看看？']) assert.ok(g.text.zh.includes(s), s);
  assert.ok(g.text.en.includes("Hi, I'm here.") && g.text.en.includes("I'm your butler and your tour guide"));
  assert.equal(g.decline.zh, '没问题，以后有什么不懂的随时问我。');
  assert.equal(g.decline.en, "No problem. If anything's unclear later, just ask me.");
  const Y = new RegExp(g.yesWords, 'i'), N = new RegExp(g.noWords, 'i');
  for (const t of ['好呀', '要', 'yes please', 'sure']) assert.ok(Y.test(t) && !N.test(t), t);
  for (const t of ['不用了', '不需要', 'no thanks', 'not now']) assert.ok(N.test(t), t);
});
test('voice server never sends SayHello at session start', () => {
  const p = [new URL('../server-voice.mjs', import.meta.url)];
  const s = fs.readFileSync(p[0], 'utf8');
  assert.ok(!/control\(300, sid, \{ content: client\.voiceGreet/.test(s));
});
