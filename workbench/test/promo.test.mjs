import test from 'node:test';
import assert from 'node:assert/strict';
import { promoAppendix, loadKb } from '../promo.mjs';
const kb = loadKb();
test('five personas have five distinct promo mechanisms with zh/en examples', () => {
  const ids = ['voice', 'scribe', 'brain', 'deep', 'admin'];
  const mech = ids.map((id) => kb.personas[id].promo.mechanism);
  assert.equal(new Set(mech).size, 5);
  for (const id of ids) { const p = kb.personas[id].promo; assert.ok(p.example.zh && p.example.en && p.trigger.zh && p.form.en, id); }
  assert.ok(kb.promoDefault.mechanism);
});
test('appendix carries persona mechanism, frequency rule and AoI = 合 (not 盒)', () => {
  const zh = promoAppendix('brain', 'zh');
  assert.match(zh, /rhyme punchline/); assert.match(zh, /3–4/); assert.match(zh, /「合」字/);
  assert.ok(!/像中文的「盒」字/.test(zh));
  assert.match(promoAppendix('nobody', 'en'), /light tip/);
  assert.ok(promoAppendix('deep', 'zh', { voice: true }).length < 1500);
});
