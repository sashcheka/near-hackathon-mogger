import assert from 'node:assert/strict';
import test from 'node:test';
import { filterProducts, storePage } from '../src/storeCatalog.ts';

const products = [
  { id: 'tea', name: 'Green tea', merchant_id: 'a', merchant_name: 'Market A', merchant_ready: true, price_yocto: '100000000000000000000001' },
  { id: 'milk', name: 'Oat milk', merchant_id: 'b', merchant_name: 'Market B', merchant_ready: false, price_yocto: '100000000000000000000000' },
  { id: 'soap', name: 'Dish soap', merchant_id: 'a', merchant_name: 'Market A', merchant_ready: true, price_yocto: '2' },
];
const filters = { query: '', merchant: 'all', configuredOnly: false, sort: 'name' };

test('combines search, merchant and payment-setup filters', () => {
  assert.deepEqual(filterProducts(products, { ...filters, query: 'MARKET a' }).map((p) => p.id), ['soap', 'tea']);
  assert.deepEqual(filterProducts(products, { ...filters, merchant: 'b', configuredOnly: true }), []);
  assert.deepEqual(filterProducts(products, { ...filters, query: 'milk', merchant: 'b' }).map((p) => p.id), ['milk']);
});

test('sorts exact large integer prices without mutating the catalog', () => {
  assert.deepEqual(filterProducts(products, { ...filters, sort: 'price-asc' }).map((p) => p.id), ['soap', 'milk', 'tea']);
  assert.deepEqual(filterProducts(products, { ...filters, sort: 'price-desc' }).map((p) => p.id), ['tea', 'milk', 'soap']);
  assert.deepEqual(products.map((p) => p.id), ['tea', 'milk', 'soap']);
});

test('clamps pages after results shrink and handles empty results', () => {
  assert.deepEqual(storePage([1, 2, 3], 5, 2), { items: [3], currentPage: 2, totalPages: 2 });
  assert.deepEqual(storePage([], 2, 6), { items: [], currentPage: 1, totalPages: 1 });
});
