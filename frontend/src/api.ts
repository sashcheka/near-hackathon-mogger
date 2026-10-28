export type Product = { id: string; name: string; price_yocto: string };

export type Order = {
  id: string;
  product_id: string;
  quantity: number;
  unit_price_yocto: string;
  total_yocto: string;
  budget_yocto: string;
  status: 'pending_payment';
};

const errors: Record<string, string> = {
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

export const createPurchase = (prompt: string, budget: string) =>
  request<Order>('/purchase-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, budget_yocto: budget }),
  });
