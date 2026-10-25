import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { apiBase, paypalEnabled, parseReturn, money, STR } = createRequire(import.meta.url)('./topup-pay.js');

test('apiBase：只接受 https（或 localhost）；空/缺省 = 关闭', () => {
  assert.equal(apiBase({}), '');
  assert.equal(apiBase({ XC_TOPUP_API: '' }), '');
  assert.equal(apiBase({ XC_TOPUP_API: 'http://evil.example' }), '');
  assert.equal(apiBase({ XC_TOPUP_API: 'javascript:alert(1)' }), '');
  assert.equal(apiBase({ XC_TOPUP_API: 'https://gate.example.org/' }), 'https://gate.example.org');
  assert.equal(apiBase({ XC_TOPUP_API: 'http://localhost:8787' }), 'http://localhost:8787');
});

test('paypalEnabled：只有云闸明确报告 enabled=true 且有面值才显示', () => {
  const cards = [{ card_cents: 500 }];
  assert.equal(paypalEnabled(null), false);
  assert.equal(paypalEnabled({ cards }), false); // 旧云闸没有 payment_providers
  assert.equal(paypalEnabled({ cards, payment_providers: { paypal: { enabled: false } } }), false);
  assert.equal(paypalEnabled({ cards, payment_providers: { paypal: { enabled: 'yes' } } }), false);
  assert.equal(paypalEnabled({ cards: [], payment_providers: { paypal: { enabled: true } } }), false);
  assert.equal(paypalEnabled({ cards, payment_providers: { paypal: { enabled: true } } }), true);
});

test('parseReturn：只认 topup=paypal 且 token 像 PayPal 订单号', () => {
  assert.equal(parseReturn(''), null);
  assert.equal(parseReturn('?topup=stripe&token=ABCDEFGH12'), null);
  assert.deepEqual(parseReturn('?topup=paypal&token=5O190127TN364715T&PayerID=X'), { orderId: '5O190127TN364715T' });
  assert.deepEqual(parseReturn('?topup=paypal&token=<script>'), { error: 'bad_token' });
  assert.deepEqual(parseReturn('?topup=paypal'), { error: 'bad_token' });
});

test('money / 中英文案键一致', () => {
  assert.equal(money(500), '$5');
  assert.equal(money(9550), '$95.50');
  assert.deepEqual(Object.keys(STR.zh).sort(), Object.keys(STR.en).sort());
});
