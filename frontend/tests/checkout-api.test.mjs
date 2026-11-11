import assert from 'node:assert/strict';
import test from 'node:test';
import { getCheckout } from '../src/api.ts';

test('checkout details require consistent amounts, item identities and recipients', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const id = '11111111-1111-4111-8111-111111111111';
  const item = { order_id: '22222222-2222-4222-8222-222222222222', product_id: 'paper', product_name: 'Paper',
    quantity: 2, unit_price_yocto: '2', total_yocto: '4', merchant_id: 'home', merchant_name: 'Home',
    receiver_id: 'home.testnet', status: 'pending_payment' };
  let body = { id, total_yocto: '4', budget_yocto: '5', items: [item] };
  globalThis.fetch = async () => new Response(JSON.stringify(body));
  assert.deepEqual(await getCheckout('token', id), body);
  for (const change of [{ total_yocto: '3' }, { budget_yocto: '3' }, { items: [] },
    { items: [item, item] }, { items: [{ ...item, receiver_id: 'bad..testnet' }] },
    { items: [{ ...item, total_yocto: '5' }] }]) {
    body = { id, total_yocto: '4', budget_yocto: '5', items: [item], ...change };
    await assert.rejects(getCheckout('token', id), /Invalid checkout/);
  }
});
