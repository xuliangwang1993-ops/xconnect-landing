import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { greetingText } from '../greet-tts.mjs';
const kb = JSON.parse(fs.readFileSync(new URL('../public/xc-tour-kb.json', import.meta.url), 'utf8'));
test('proactive greeting script + branch words', () => {
  const g = kb.greeting;
  for (const s of ['嗨，我来了。', '我是你的助手，我是{name}。', '我是你的管家，也是你的导游', '你是第一次来，还是都已经熟了？想让我给你介绍哪个功能吗？']) assert.ok(g.text.zh.includes(s), s);
  assert.equal(g.decline.zh, '没问题，以后有什么不懂的随时问我。');
  assert.ok(new RegExp(g.firstWords).test('我是第一次来'));
  assert.ok(new RegExp(g.knowWords).test('都已经熟了'));
  assert.ok(new RegExp(g.noWords, 'i').test('不用了'));
  const aoi = kb.tours.find((t) => t.keywords && new RegExp(t.keywords, 'i').test('给我讲讲 AoI'));
  assert.equal(aoi.id, 'aoi');
});
test('spoken greeting uses persona name per language', () => {
  assert.match(greetingText('greeting', 'brain', 'zh'), /我是四毛。/);
  assert.match(greetingText('greeting', 'scribe', 'en'), /I'm Sparky\./);
  assert.match(greetingText('decline', 'deep', 'zh'), /没问题/);
});
test('voice server sends the KB greeting (SayHello) at session start', () => {
  const s = fs.readFileSync(new URL('../server-voice.mjs', import.meta.url), 'utf8');
  assert.match(s, /greetingText\('greeting'/); assert.match(s, /control\(300, sid, \{ content \}\)/);
});
