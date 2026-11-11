import { useEffect, useRef, useState } from 'react';
import { ApiError, createCheckout } from './api';
import type { CartItem, Checkout, CheckoutRequest, Product } from './api';
import { fromYocto, toYocto } from './amounts';
import { clearCheckoutDraft, readCheckoutDraft, saveCheckoutDraft } from './checkoutStorage';

type Props = { products: Product[]; cart: CartItem[]; setCart: (items: CartItem[]) => void;
  accountId: string; token: string; budget: string; setBudget: (value: string) => void;
  onCreated: (checkout: Checkout) => void };

export default function Cart({ products, cart, setCart, accountId, token, budget, setBudget, onCreated }: Props) {
  const [draft, setDraft] = useState<CheckoutRequest | null>(() => {
    try { return accountId ? readCheckoutDraft(accountId) : null; } catch { return null; }
  });
  const [error, setError] = useState(() => {
    try { if (accountId) readCheckoutDraft(accountId); return ''; }
    catch (reason) { return reason instanceof Error ? reason.message : 'Checkout recovery is unavailable.'; }
  });
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const items = draft?.items ?? cart;
  const known = items.every((item) => products.some((product) => product.id === item.product_id));
  const total = items.reduce((sum, item) => {
    const product = products.find((value) => value.id === item.product_id);
    return sum + (product ? BigInt(product.price_yocto) * BigInt(item.quantity) : 0n);
  }, 0n);

  async function checkout() {
    if (inFlight.current || !token || !accountId || error.startsWith('Checkout recovery data')) return;
    inFlight.current = true;
    setError('');
    try {
      const request = draft ?? { id: crypto.randomUUID(), budget_yocto: toYocto(budget.trim()), items };
      saveCheckoutDraft(accountId, request);
      setDraft(request);
      setBusy(true);
      const result = await createCheckout(token, request);
      if (result.id !== request.id || !Array.isArray(result.items) || result.items.length !== request.items.length)
        throw new Error('Checkout result could not be verified. Retry the same checkout.');
      clearCheckoutDraft(accountId);
      if (!active.current) return;
      setDraft(null);
      setCart([]);
      onCreated(result);
    } catch (reason) {
      if (reason instanceof ApiError && (reason.status === 400 ||
          (reason.status === 409 && reason.code !== 'checkout_conflict'))) {
        try { clearCheckoutDraft(accountId); if (active.current) setDraft(null); } catch { /* Keep the saved request for recovery. */ }
      }
      if (active.current) setError(reason instanceof Error ? reason.message : 'Checkout could not be created.');
    } finally { inFlight.current = false; if (active.current) setBusy(false); }
  }

  return <section aria-labelledby="cart-title">
    <h2 id="cart-title">Your cart</h2>
    {draft && <p>Checkout is awaiting confirmation. Retry to recover the same order.</p>}
    {items.length === 0 ? <p>Your cart is empty. Add products from the store.</p> : <>
      <ul className="orders-list">
        {items.map((item) => {
          const product = products.find((value) => value.id === item.product_id);
          return <li className="order-item" key={item.product_id}>
            <div className="order-summary"><div className="order-product">
              <strong>{product?.name ?? item.product_id}</strong><small>{product?.merchant_name ?? 'Product unavailable'}</small>
            </div><div className="order-total"><small>Total</small>
              <strong>{product ? fromYocto((BigInt(product.price_yocto) * BigInt(item.quantity)).toString()) : '—'} test NEAR</strong></div></div>
            <div className="cart-controls">
              <label htmlFor={`qty-${item.product_id}`}>Quantity</label>
              <input id={`qty-${item.product_id}`} type="number" min="1" max="1000" value={item.quantity}
                disabled={!!draft || busy} onChange={(event) => {
                  const quantity = Number(event.target.value);
                  if (Number.isInteger(quantity) && quantity >= 1 && quantity <= 1000)
                    setCart(cart.map((line) => line.product_id === item.product_id ? { ...line, quantity } : line));
                }} />
              <button className="secondary-button" type="button" disabled={!!draft || busy}
                onClick={() => setCart(cart.filter((line) => line.product_id !== item.product_id))}>Remove</button>
            </div>
          </li>;
        })}
      </ul>
      <div className="cart-checkout">
        <p>Estimated total: <strong>{known ? fromYocto(total.toString()) : 'Unavailable'} test NEAR</strong></p>
        <label htmlFor="cart-budget">Budget for this purchase (test NEAR)</label>
        <input id="cart-budget" inputMode="decimal" maxLength={40} value={draft ? fromYocto(draft.budget_yocto) : budget}
          disabled={!!draft || busy} onChange={(event) => setBudget(event.target.value)} />
        <small>Prices are checked again before the order is created.</small>
        <small>Your allowed-merchant rule applies to every item. Clear it to buy from different merchants.</small>
        {!token && <p>Connect and verify your wallet to create an order.</p>}
        <button type="button" disabled={busy || !token || (!draft && !known)} onClick={() => { void checkout(); }}>
          {busy ? 'Creating order…' : draft ? 'Retry checkout' : 'Review order'}
        </button>
      </div>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
