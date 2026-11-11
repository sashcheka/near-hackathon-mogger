import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createPurchase, getCheckout, getOrder, getProducts } from './api';
import type { CartItem, Checkout, Order, Product } from './api';
import { fromYocto, toYocto } from './amounts';
import WalletPanel from './WalletPanel';
import { useWallet } from './WalletProvider';
import MyOrders from './MyOrders';
import PaymentPanel from './PaymentPanel';
import PolicyPanel from './PolicyPanel';
import Store from './Store';
import Cart from './Cart';
import CheckoutDetails from './CheckoutDetails';
import { parseRoute } from './routes';

export default function App() {
  const { session, busy: walletBusy } = useWallet();
  const requestVersion = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
  const { view } = route;
  const savedReturn = window.history.state?.returnPath;
  const returnPath = typeof savedReturn === 'string' && parseRoute(savedReturn).view !== 'not-found' ? savedReturn : '/orders';
  function navigate(path: string, from?: string) {
    if (path === window.location.pathname) return;
    window.history.pushState(from ? { returnPath: from } : {}, '', path);
    setRoute(parseRoute(path));
  }
  const previousView = useRef(view);
  const [prompt, setPrompt] = useState('Buy one pack of toilet paper');
  const [budget, setBudget] = useState('0.03');
  const [products, setProducts] = useState<Product[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [ordersRevision, setOrdersRevision] = useState(0);

  useEffect(() => {
    function onPopState() {
      ++requestVersion.current;
      setBusy(false);
      setError('');
      setRoute(parseRoute(window.location.pathname));
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (previousView.current !== view) heading.current?.focus();
    previousView.current = view;
  }, [view]);

  useEffect(() => {
    if (view !== 'order' || !route.id || !session) return;
    let active = true;
    const version = requestVersion.current;
    setOrder(null);
    setError('');
    getOrder(route.id, session.token).then((saved) => {
      if (active && requestVersion.current === version) setOrder(saved);
    }).catch((error: Error) => {
      if (active && requestVersion.current === version) {
        setOrder(null);
        setError(error.message);
      }
    });
    return () => { active = false; };
  }, [view, route.id, session?.token]);

  useEffect(() => {
    if (view !== 'checkout' || !route.id || !session) return;
    let active = true;
    setCheckout(null);
    setError('');
    getCheckout(session.token, route.id).then((saved) => {
      if (active) setCheckout(saved);
    }).catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [view, route.id, session?.token]);

  useEffect(() => {
    setOrder(null);
    setCheckout(null);
    setError('');
    setBusy(false);
    return () => { ++requestVersion.current; };
  }, [session?.token]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setCatalogError('');
    getProducts().then(({ products }) => {
      if (active) setProducts(products);
    }).catch((error: Error) => {
      if (active) setCatalogError(error.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [catalogRevision]);

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
        navigate(`/orders/${created.id}`, '/');
        setOrdersRevision((revision) => revision + 1);
      }
    } catch (error) {
      if (requestVersion.current === version) setOrdersRevision((revision) => revision + 1);
      if (requestVersion.current === version)
        setError(error instanceof Error ? error.message : 'The request could not be completed.');
    } finally {
      if (requestVersion.current === version) setBusy(false);
    }
  }

  return (
    <main className={view === 'store' ? 'store-page' : undefined}>
      <header>
        <p className="eyebrow">Community Treasury · NEAR Testnet</p>
        <h1 ref={heading} tabIndex={-1}>
          {view === 'orders' ? 'Your orders.' : view === 'order' || view === 'checkout' ? 'Order details.'
            : view === 'store' ? 'Explore the store.' : view === 'cart' ? 'Your cart.' : 'A purchase within your budget.'}
        </h1>
        <p>{view === 'orders' ? 'Review your purchases and payment statuses.'
          : view === 'order' || view === 'checkout' ? 'Review your order and payment details.'
          : view === 'store' ? 'Browse the demo products available to the assistant.'
          : view === 'cart' ? 'Review products and set a budget before ordering.'
          : 'Describe what you need. Review the assistant’s selection before paying.'}</p>
      </header>

      <WalletPanel balanceRevision={ordersRevision} showBalance={view !== 'store'}
        onStore={view === 'purchase' ? () => {
          ++requestVersion.current;
          setBusy(false);
          setError('');
          setOrder(null);
          setCatalogRevision((revision) => revision + 1);
          navigate('/store');
        } : undefined}
        navigationLabel={view === 'order'
        ? (returnPath.startsWith('/checkouts/') ? '← Back to order' : returnPath === '/orders' ? '← Back to orders' : '← Back to purchase')
        : view === 'checkout' ? (returnPath === '/store' ? '← Back to store' : '← Back to orders')
        : view === 'cart' ? '← Back to store' : view === 'orders' || view === 'store' ? '← Back to purchase' : 'Orders'}
        onToggleView={() => {
          ++requestVersion.current;
          setBusy(false);
          setError('');
          setOrder(null);
          navigate(view === 'order' || view === 'checkout' ? returnPath
            : view === 'cart' ? '/store' : view === 'orders' || view === 'store' ? '/' : '/orders');
        }} />
      {session && (view === 'purchase' || view === 'orders') && <PolicyPanel key={session.token} token={session.token} budget={budget}
        revision={ordersRevision} onSaved={() => setOrdersRevision((revision) => revision + 1)} />}
      <section id="workspace">
      {(view === 'order' || view === 'checkout') && !session && <p>Connect your wallet and verify ownership to view this order.</p>}
      {view === 'not-found' && <p>Page not found. Use the navigation to continue.</p>}
      {view === 'store' ? <Store products={products} loading={loading} error={catalogError} cart={cart} token={session?.token ?? ''}
        onRefresh={() => setCatalogRevision((revision) => revision + 1)} onCart={() => navigate('/cart')}
        onAdd={(product, quantity) => setCart((items) => items.some((item) => item.product_id === product.id)
          ? items.map((item) => item.product_id === product.id ? { ...item, quantity: Math.min(item.quantity + quantity, 1000) } : item)
          : items.length < 20 ? [...items, { product_id: product.id, quantity }] : items)}
        onDecrease={(product) => setCart((items) => items.map((item) => item.product_id === product.id
          ? { ...item, quantity: item.quantity - 1 } : item).filter((item) => item.quantity > 0))} />
      : view === 'cart' ? <Cart key={session?.account_id ?? 'guest'} products={products} cart={cart} setCart={setCart}
        accountId={session?.account_id ?? ''} token={session?.token ?? ''} budget={budget} setBudget={setBudget}
        onCreated={(saved) => { setCheckout(saved); navigate(`/checkouts/${saved.id}`, '/store');
          setOrdersRevision((revision) => revision + 1); }} />
      : view === 'checkout' && session && checkout && checkout.id === route.id ? <CheckoutDetails key={checkout.id} checkout={checkout}
        accountId={session.account_id} token={session.token} onUpdate={setCheckout}
        onPaid={() => setOrdersRevision((revision) => revision + 1)} onReview={(item) => {
          setOrder({ id: item.order_id, product_id: item.product_id, quantity: item.quantity,
            unit_price_yocto: item.unit_price_yocto, total_yocto: item.total_yocto,
            budget_yocto: checkout.budget_yocto, status: item.status });
          setError(''); navigate(`/orders/${item.order_id}`, `/checkouts/${checkout.id}`);
        }} /> : view === 'orders' ? <>
        {session ? <MyOrders key={session.token} token={session.token}
          products={products} revision={ordersRevision} onReview={(saved) => {
            ++requestVersion.current;
            setBusy(false);
            setOrder(saved);
            setError('');
            navigate(`/orders/${saved.id}`, '/orders');
          }} onCheckout={(saved) => { setCheckout(saved); setError(''); navigate(`/checkouts/${saved.id}`, '/orders'); }} />
          : <p>Connect your wallet and verify ownership to see your orders.</p>}
      </> : <>
      {view === 'purchase' && <>
      {!session && <p>Connect your wallet and verify ownership to create an order.</p>}

      <form onSubmit={submit}>
        <fieldset disabled={busy || loading || !!catalogError || walletBusy || !session || products.length === 0}>
          <label htmlFor="prompt">What do you need?</label>
          <textarea id="prompt" required maxLength={2000} rows={3}
            value={prompt} onChange={(event) => {
              setPrompt(event.target.value);
              setOrder(null);
            }} />
          <label htmlFor="budget">Budget for this purchase (test NEAR)</label>
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
      {catalogError && <p className="error" role="alert">{catalogError}</p>}
      {!loading && !catalogError && products.length === 0 && <p>No products are available.</p>}
      </>}
      {error && <p className="error" role="alert">{error}</p>}
      <section aria-live="polite" aria-busy={busy}>
        {view === 'order' && session && order && order.id === route.id && <article className="order-details">
          <div className="order-details-heading">
            <span className="eyebrow">Order summary</span>
            <span className={`order-status ${order.status}`}>
              {order.status === 'paid' ? 'Paid' : order.status === 'cancelled' ? 'Cancelled' : 'Awaiting payment'}
            </span>
          </div>
          <div className="order-summary order-details-product">
            <div className="order-product">
              <h2>{products.find((product) => product.id === order.product_id)?.name ?? order.product_id}</h2>
              <small>Qty {order.quantity} · {fromYocto(order.unit_price_yocto)} test NEAR each</small>
            </div>
            <div className="order-total">
              <small>Total</small>
              <strong>{fromYocto(order.total_yocto)} test NEAR</strong>
            </div>
          </div>
          <div className="order-details-meta">
            <small>Purchase budget <strong>{fromYocto(order.budget_yocto)} test NEAR</strong></small>
            <small>Order {order.id}</small>
          </div>
          {order.status === 'pending_payment' && <p>Check that the product and quantity match your request before paying.</p>}
          {session && <PaymentPanel key={`${session.token}:${order.id}`} orderId={order.id}
            accountId={session.account_id} token={session.token} onPaid={(paid) => {
              setOrder(paid);
              setOrdersRevision((revision) => revision + 1);
            }} />}
        </article>}
      </section>
      </>}
      </section>
    </main>
  );
}
