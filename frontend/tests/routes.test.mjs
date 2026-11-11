import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRoute } from '../src/routes.ts';

test('recognizes navigation and order links', () => {
  const id = '931c3c63-cba2-4106-bfee-7c011381ec81';
  assert.deepEqual(parseRoute('/'), { view: 'purchase' });
  assert.deepEqual(parseRoute('/store'), { view: 'store' });
  assert.deepEqual(parseRoute('/cart'), { view: 'cart' });
  assert.deepEqual(parseRoute('/orders'), { view: 'orders' });
  assert.deepEqual(parseRoute(`/orders/${id}`), { view: 'order', id });
  assert.deepEqual(parseRoute(`/checkouts/${id}`), { view: 'checkout', id });
  assert.deepEqual(parseRoute('/orders/not-an-id'), { view: 'not-found' });
  assert.deepEqual(parseRoute('//example.com'), { view: 'not-found' });
});
