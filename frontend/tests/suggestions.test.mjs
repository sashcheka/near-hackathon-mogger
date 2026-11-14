import assert from 'node:assert/strict';
import test from 'node:test';
import { suggestProduct, suggestShoppingList } from '../src/api.ts';

test('requests a suggestion without creating an order and validates the response', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let body = { product_id: 'milk-whole', quantity: 2 };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/purchase-requests');
    assert.equal(options.headers.Authorization, 'Bearer token');
    assert.deepEqual(JSON.parse(options.body), { prompt: 'Buy milk', selection_only: true });
    return new Response(JSON.stringify(body));
  };
  assert.deepEqual(await suggestProduct('token', 'Buy milk'), body);
  for (const invalid of [{ product_id: '', quantity: 1 }, { product_id: 'milk', quantity: 0 },
    { product_id: 'milk', quantity: 1001 }, { product_id: 'milk', quantity: 1.5 }]) {
    body = invalid;
    await assert.rejects(suggestProduct('token', 'Buy milk'), /invalid selection/);
  }
});

test('validates multiple suggestions and missing items', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let body = { items: [{ product_id: 'milk-whole', quantity: 2 }], missing: ['soy milk'] };
  globalThis.fetch = async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body), { prompt: 'Buy milk', multiple: true });
    return new Response(JSON.stringify(body));
  };
  assert.deepEqual(await suggestShoppingList('token', 'Buy milk'), body);
  for (const invalid of [
    { items: [], missing: [] },
    { items: [{ product_id: 'milk', quantity: 0 }], missing: [] },
    { items: [{ product_id: 'milk', quantity: 1 }, { product_id: 'milk', quantity: 2 }], missing: [] },
    { items: [], missing: [42] },
  ]) {
    body = invalid;
    await assert.rejects(suggestShoppingList('token', 'Buy milk'), /invalid selection/);
  }
});
