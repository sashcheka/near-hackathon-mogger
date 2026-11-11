import type { CheckoutRequest } from './api';

const key = (account: string) => `community-treasury:testnet:checkout:${account}`;

export function readCheckoutDraft(account: string): CheckoutRequest | null {
  const raw = localStorage.getItem(key(account));
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw);
    if (value && typeof value.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.id) &&
      typeof value.budget_yocto === 'string' && /^[1-9][0-9]{0,38}$/.test(value.budget_yocto) &&
      Array.isArray(value.items) && value.items.length > 0 && value.items.length <= 20 &&
      value.items.every((item: { product_id: unknown; quantity: unknown }) =>
        typeof item.product_id === 'string' && item.product_id.length > 0 && item.product_id.length <= 128 &&
        Number.isInteger(item.quantity) && (item.quantity as number) >= 1 && (item.quantity as number) <= 1000))
      return value as CheckoutRequest;
  } catch { /* An unreadable draft must not create another order. */ }
  throw new Error('Checkout recovery data is unreadable. Check your orders before continuing.');
}

export function saveCheckoutDraft(account: string, request: CheckoutRequest) {
  const value = JSON.stringify(request);
  localStorage.setItem(key(account), value);
  if (localStorage.getItem(key(account)) !== value) throw new Error('Could not save checkout recovery.');
}

export function clearCheckoutDraft(account: string) {
  localStorage.removeItem(key(account));
}
