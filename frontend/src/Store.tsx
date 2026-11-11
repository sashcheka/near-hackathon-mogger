import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { suggestProduct } from './api';
import type { CartItem, Product } from './api';
import { fromYocto } from './amounts';

type Props = { products: Product[]; loading: boolean; error: string; onRefresh: () => void;
  cart: CartItem[]; token: string; onAdd: (product: Product, quantity: number) => void; onCart: () => void };

export default function Store({ products, loading, error, onRefresh, cart, token, onAdd, onCart }: Props) {
  const [prompt, setPrompt] = useState('');
  const [suggestion, setSuggestion] = useState<CartItem | null>(null);
  const [suggestionError, setSuggestionError] = useState('');
  const [thinking, setThinking] = useState(false);
  const requestVersion = useRef(0);
  useEffect(() => {
    setSuggestion(null);
    setSuggestionError('');
    setThinking(false);
    return () => { ++requestVersion.current; };
  }, [token]);
  const selected = products.find((product) => product.id === suggestion?.product_id);
  const selectedQuantity = cart.find((item) => item.product_id === selected?.id)?.quantity ?? 0;
  const canAddSelection = !!selected && !!suggestion && selectedQuantity + suggestion.quantity <= 1000 &&
    (selectedQuantity > 0 || cart.length < 20);
  async function suggest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || thinking) return;
    const version = ++requestVersion.current;
    setThinking(true);
    setSuggestion(null);
    setSuggestionError('');
    try {
      const result = await suggestProduct(token, prompt.trim());
      if (requestVersion.current === version) setSuggestion(result);
    } catch (reason) {
      if (requestVersion.current === version)
        setSuggestionError(reason instanceof Error ? reason.message : 'The assistant is unavailable.');
    } finally { if (requestVersion.current === version) setThinking(false); }
  }
  const merchants = [...new Map(products.map((p) => [p.merchant_id, p.merchant_name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  return <section aria-labelledby="store-title" aria-busy={loading}>
    <div className="wallet-controls">
      <div>
        <h2 id="store-title">Demo catalog</h2>
        {!loading && !error && <small>{products.length} products · Prices in test NEAR</small>}
      </div>
      <div className="store-actions">
        <button className="secondary-button store-refresh" type="button" disabled={loading} onClick={onRefresh}>Refresh</button>
        <button type="button" onClick={onCart}>Cart{count > 0 && ` (${count})`}</button>
      </div>
    </div>
    {loading && <p role="status">Loading products…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {!loading && !error && products.length === 0 && <p>No products are available.</p>}
    <form className="store-assistant" onSubmit={suggest}>
      <label htmlFor="store-prompt">Ask the assistant</label>
      <small>Describe one product; review the selection before adding it to the cart.</small>
      <textarea id="store-prompt" value={prompt} rows={2} maxLength={2000} required disabled={thinking}
        onChange={(event) => { setPrompt(event.target.value); setSuggestion(null); }} />
      {!token && <small>Connect and verify your wallet to use the assistant.</small>}
      <button type="submit" disabled={!token || thinking || loading || !!error}>
        {thinking ? 'Finding a product…' : 'Find a product'}
      </button>
      {suggestionError && <p className="error" role="alert">{suggestionError}</p>}
      {suggestion && <div className="store-suggestion" role="status">
        {selected ? <><strong>{selected.name}</strong><small>{selected.merchant_name} · Qty {suggestion.quantity} · {fromYocto(selected.price_yocto)} test NEAR each</small>
          <button className="secondary-button" type="button" disabled={!canAddSelection}
            onClick={() => { onAdd(selected, suggestion.quantity); setSuggestion(null); }}>Add selection</button>
          {!canAddSelection && <small>Cart quantity or product limit reached.</small>}</>
          : <p>This product is no longer available. Refresh the catalog.</p>}
      </div>}
    </form>
    {cart.length >= 20 && <small>A cart can contain up to 20 different products.</small>}
    {!loading && !error && merchants.map(([id, name]) => <section key={id} className="store-merchant">
      <h3>{name}</h3>
      {!products.find((product) => product.merchant_id === id)?.merchant_ready &&
        <small>Payment setup needed before ordering from this merchant.</small>}
      <ul className="store-grid">
        {products.filter((product) => product.merchant_id === id).map((product) => <li className="store-product" key={product.id}>
          <strong>{product.name}</strong>
          <div className="store-product-footer">
            <div><small>Price</small><span>{fromYocto(product.price_yocto)} test NEAR</span></div>
            <button className="secondary-button store-add" type="button"
              disabled={(cart.find((item) => item.product_id === product.id)?.quantity ?? 0) >= 1000 ||
                (cart.length >= 20 && !cart.some((item) => item.product_id === product.id))}
              aria-label={`Add ${product.name} to cart`} onClick={() => onAdd(product, 1)}>Add</button>
          </div>
        </li>)}
      </ul>
    </section>)}
  </section>;
}
