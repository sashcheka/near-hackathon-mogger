import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createPurchase, getProducts } from './api';
import type { Order, Product } from './api';
import { fromYocto, toYocto } from './amounts';
import WalletPanel from './WalletPanel';
import { useWallet } from './WalletProvider';
import MyOrders from './MyOrders';

export default function App() {
  const { session, busy: walletBusy } = useWallet();
  const requestVersion = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const [view, setView] = useState<'purchase' | 'orders'>('purchase');
  const [prompt, setPrompt] = useState('Buy one pack of toilet paper');
  const [budget, setBudget] = useState('3');
  const [products, setProducts] = useState<Product[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ordersRevision, setOrdersRevision] = useState(0);

  useEffect(() => { heading.current?.focus(); }, [view]);

  useEffect(() => {
    setOrder(null);
    setError('');
    setBusy(false);
    return () => { ++requestVersion.current; };
  }, [session?.token]);

  useEffect(() => {
    let active = true;
    getProducts().then(({ products }) => {
      if (active) setProducts(products);
    }).catch((error: Error) => {
      if (active) setError(error.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || walletBusy || !session) return;
    const version = ++requestVersion.current;
    setError('');
    setOrder(null);
    try {
      const amount = toYocto(budget.trim());
      setBusy(true);
      const created = await createPurchase(prompt.trim(), amount, session.token);
      if (requestVersion.current === version) {
        setOrder(created);
        setOrdersRevision((revision) => revision + 1);
      }
    } catch (error) {
      if (requestVersion.current === version)
        setError(error instanceof Error ? error.message : 'The request could not be completed.');
    } finally {
      if (requestVersion.current === version) setBusy(false);
    }
  }

  return (
    <main>
      <header>
        <p className="eyebrow">Community Treasury · NEAR Testnet</p>
        <h1 ref={heading} tabIndex={-1}>
          {view === 'orders' ? 'Your orders.' : 'A purchase within your budget.'}
        </h1>
        <p>{view === 'orders' ? 'Review your purchases and payment statuses.'
          : 'Describe what you need. Review the assistant’s selection before paying.'}</p>
      </header>

      <WalletPanel ordersOpen={view === 'orders'} onOrders={() => setView('orders')} />
      <section id="workspace">
      {view === 'orders' ? <>
        <button className="secondary-button" type="button" onClick={() => setView('purchase')}>
          ← Back to purchase
        </button>
        {session ? <MyOrders key={session.token} token={session.token}
          products={products} revision={ordersRevision} />
          : <p>Connect your wallet and verify ownership to see your orders.</p>}
      </> : <>
      {!session && <p>Connect your wallet and verify ownership to create an order.</p>}

      <form onSubmit={submit}>
        <fieldset disabled={busy || loading || walletBusy || !session || products.length === 0}>
          <label htmlFor="prompt">What do you need?</label>
          <textarea id="prompt" required maxLength={2000} rows={3}
            value={prompt} onChange={(event) => {
              setPrompt(event.target.value);
              setOrder(null);
            }} />
          <label htmlFor="budget">Maximum budget (test NEAR)</label>
          <input id="budget" type="text" inputMode="decimal" required maxLength={40}
            value={budget} onChange={(event) => {
              setBudget(event.target.value);
              setOrder(null);
            }}
            aria-describedby="budget-hint" />
          <small id="budget-hint">This limit applies to this purchase.</small>
          <button type="submit">{busy ? 'Selecting a product…' : 'Find a product'}</button>
        </fieldset>
      </form>

      {loading && <p role="status">Loading catalog…</p>}
      {!loading && !error && products.length === 0 && <p>No products are available.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <section aria-live="polite" aria-busy={busy}>
        {order && <article>
          <p className="eyebrow">Review your order · Unpaid</p>
          <h2>{products.find((product) => product.id === order.product_id)?.name ?? order.product_id}</h2>
          <dl>
            <dt>Quantity</dt><dd>{order.quantity}</dd>
            <dt>Unit price</dt><dd>{fromYocto(order.unit_price_yocto)} test NEAR</dd>
            <dt>Total</dt><dd>{fromYocto(order.total_yocto)} test NEAR</dd>
            <dt>Budget</dt><dd>{fromYocto(order.budget_yocto)} test NEAR</dd>
          </dl>
          <p>Check that the product and quantity match your request. No funds have been sent.</p>
          <small>Order: {order.id}</small>
        </article>}
      </section>
      </>}
      </section>
    </main>
  );
}
