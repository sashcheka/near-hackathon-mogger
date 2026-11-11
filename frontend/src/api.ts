export type Product = { id: string; name: string; price_yocto: string;
  merchant_id: string; merchant_name: string };

export type Order = {
  id: string;
  product_id: string;
  quantity: number;
  unit_price_yocto: string;
  total_yocto: string;
  budget_yocto: string;
  status: 'pending_payment' | 'paid';
};

export type PaymentDetails = {
  network_id: 'testnet'; receiver_id: string; asset: 'NEAR'; amount_yocto: string;
};
export type OrderDetails = Order & { payment: PaymentDetails | null; transaction_hash: string | null; policy_error: string };
export type PaymentVerification = {
  verified: true; order_id: string; transaction_hash: string;
  sender_id: string; network_id: 'testnet'; order_status: 'paid';
};
export type PurchasePolicy = {
  max_order_yocto: string; max_unit_yocto: string; allowed_merchant: string;
};
export type PolicyDecision = {
  product_id: string; total_yocto: string; decision: 'allowed' | 'blocked'; reason: string;
};

const errors: Record<string, string> = {
  unauthorized: 'Wallet verification failed or your session expired. Please verify again.',
  invalid_challenge: 'The sign-in request expired or was already used. Please try again.',
  auth_rpc_failed: 'The wallet verification service is unavailable. Please try again.',
  invalid_request: 'Check your request and budget.',
  product_not_found: 'The selected product is no longer available.',
  budget_exceeded: 'The selected purchase exceeds your budget.',
  policy_order_limit: 'The total exceeds your saved purchase limit.',
  policy_unit_limit: 'The unit price exceeds your saved unit price limit.',
  policy_merchant: 'The merchant is not allowed by your saved rules.',
  merchant_not_configured: 'This merchant has not set up a Testnet payment account yet.',
  balance_unavailable: 'Wallet balance is unavailable. Try refreshing.',
  no_matching_product: 'No matching product was found in the catalog.',
  invalid_model_response: 'The assistant returned an invalid selection. Please try again.',
  model_unavailable: 'The assistant is unavailable. Please try again later.',
  model_timeout: 'The assistant took too long to respond. Please try again.',
  transaction_pending: 'The transfer is not finalized yet. Check this payment again shortly.',
  transaction_not_found: 'The transfer is not visible yet. Check the hash and try verification again.',
  transaction_failed: 'The transaction failed. Check its outcome in your wallet.',
  transaction_mismatch: 'The transfer does not match this order. Check its recipient and amount.',
  transaction_before_order: 'This transfer predates the order and cannot pay it.',
  transaction_already_used: 'This transfer has already paid another order.',
  order_already_paid: 'This order has already been paid. Refresh its status.',
  order_changed: 'The saved order changed. Check its details before continuing.',
  payment_not_configured: 'Payments are not configured for this order.',
  rpc_unavailable: 'Payment verification is unavailable. Keep the transaction hash and check again.',
  rpc_timeout: 'Verification timed out. Check the same payment again; do not send another transfer.',
};

export function policyMessage(code: string) {
  return errors[code] ?? 'Purchase rules could not be checked. Refresh the order.';
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) {
    super(errors[code] ?? 'The purchase service could not complete your request.');
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, options);
  } catch {
    throw new Error('The purchase service could not be reached.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.error) {
    throw new ApiError(typeof body?.error === 'string' ? body.error : 'unknown_error', response.status);
  }
  if (!body) throw new Error('The purchase service returned an unreadable response.');
  return body as T;
}

export const getProducts = () => request<{ products: Product[] }>('/products');

export async function getWalletBalance(accountId: string) {
  const result = await request<{ account_id: string; network_id: string; amount_yocto: string }>(
    `/wallets/${encodeURIComponent(accountId)}/balance`);
  if (result.account_id !== accountId || result.network_id !== 'testnet' ||
      typeof result.amount_yocto !== 'string' || !/^(0|[1-9][0-9]{0,38})$/.test(result.amount_yocto))
    throw new Error('Wallet balance could not be verified. Try refreshing.');
  return result.amount_yocto;
}

export const getPolicy = (token: string) => request<PurchasePolicy>('/purchase-policy/settings', {
  headers: { Authorization: `Bearer ${token}` },
});
export const savePolicy = (token: string, policy: PurchasePolicy) =>
  request<PurchasePolicy>('/purchase-policy/settings', {
    method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(policy),
  });
export const getPolicyHistory = (token: string) => request<{ decisions: PolicyDecision[] }>('/purchase-policy/history', {
  headers: { Authorization: `Bearer ${token}` },
});

export const getOrders = (token: string) => request<{ orders: Order[] }>('/orders', {
  headers: { Authorization: `Bearer ${token}` },
});

export const getOrder = (id: string, token: string) => request<OrderDetails>(`/orders/${encodeURIComponent(id)}`, {
  headers: { Authorization: `Bearer ${token}` },
});

export async function verifyPayment(id: string, token: string, hash: string) {
  const result = await request<PaymentVerification>(`/orders/${encodeURIComponent(id)}/verify-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ transaction_hash: hash }),
  });
  if (result.verified !== true || result.order_status !== 'paid' || result.order_id !== id ||
    result.transaction_hash !== hash || result.network_id !== 'testnet')
    throw new Error('The service did not confirm this payment. Check the same transaction again.');
  return result;
}

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
