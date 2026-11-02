export type Product = { id: string; name: string; price_yocto: string };

export type Order = {
  id: string;
  product_id: string;
  quantity: number;
  unit_price_yocto: string;
  total_yocto: string;
  budget_yocto: string;
  status: 'pending_payment' | 'paid';
};

const errors: Record<string, string> = {
  unauthorized: 'Wallet verification failed or your session expired. Please verify again.',
  invalid_challenge: 'The sign-in request expired or was already used. Please try again.',
  auth_rpc_failed: 'The wallet verification service is unavailable. Please try again.',
  invalid_request: 'Check your request and budget.',
  product_not_found: 'The selected product is no longer available.',
  budget_exceeded: 'The selected purchase exceeds your budget.',
  no_matching_product: 'No matching product was found in the catalog.',
  invalid_model_response: 'The assistant returned an invalid selection. Please try again.',
  model_unavailable: 'The assistant is unavailable. Please try again later.',
  model_timeout: 'The assistant took too long to respond. Please try again.',
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, options);
  } catch {
    throw new Error('The purchase service could not be reached.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(errors[body?.error] ?? 'The purchase service could not complete your request.');
  }
  if (!body) throw new Error('The purchase service returned an unreadable response.');
  return body as T;
}

export const getProducts = () => request<{ products: Product[] }>('/products');

export const getOrders = (token: string) => request<{ orders: Order[] }>('/orders', {
  headers: { Authorization: `Bearer ${token}` },
});

export const getOrder = (id: string, token: string) => request<Order>(`/orders/${encodeURIComponent(id)}`, {
  headers: { Authorization: `Bearer ${token}` },
});

export type AuthChallenge = {
  nonce: string;
  message: string;
  recipient: string;
  expires_in: number;
};
export type AuthSession = { token: string; account_id: string; expires_in: number };

export const getAuthChallenge = (accountId: string) => request<AuthChallenge>('/auth/challenge', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account_id: accountId }),
});

export const verifyWallet = (nonce: string, publicKey: string, signature: string) =>
  request<AuthSession>('/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nonce, public_key: publicKey, signature }),
  });

export const revokeSession = (token: string) => request('/auth/session', {
  method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
});

export const getAuthSession = (token: string) => request<{ account_id: string }>('/auth/session', {
  headers: { Authorization: `Bearer ${token}` },
});

export const createPurchase = (prompt: string, budget: string, token: string) =>
  request<Order>('/purchase-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ prompt, budget_yocto: budget }),
  });
