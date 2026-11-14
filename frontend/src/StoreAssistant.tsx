import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { suggestShoppingList } from './api';
import type { CartItem, Product, ShoppingSuggestion } from './api';
import { fromYocto } from './amounts';

type Props = { products: Product[]; cart: CartItem[]; token: string; disabled: boolean;
  onAdd: (product: Product, quantity: number) => void };

export default function StoreAssistant({ products, cart, token, disabled, onAdd }: Props) {
  const [prompt, setPrompt] = useState('');
  const [suggestion, setSuggestion] = useState<ShoppingSuggestion | null>(null);
  const [error, setError] = useState('');
  const [thinking, setThinking] = useState(false);
  const requestVersion = useRef(0);
  useEffect(() => {
    setSuggestion(null);
    setError('');
    setThinking(false);
    return () => { ++requestVersion.current; };
  }, [token]);
  const selections = suggestion?.items.map((item) => ({ item, product: products.find((p) => p.id === item.product_id) })) ?? [];
  const newItems = selections.filter(({ item }) => !cart.some((entry) => entry.product_id === item.product_id)).length;
  const canAdd = selections.length > 0 && cart.length + newItems <= 20 && selections.every(({ item, product }) =>
    !!product && (cart.find((entry) => entry.product_id === item.product_id)?.quantity ?? 0) + item.quantity <= 1000);

  async function suggest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || thinking) return;
    const version = ++requestVersion.current;
    setThinking(true);
    setSuggestion(null);
    setError('');
    try {
      const result = await suggestShoppingList(token, prompt.trim());
      if (requestVersion.current === version) setSuggestion(result);
    } catch (reason) {
      if (requestVersion.current === version)
        setError(reason instanceof Error ? reason.message : 'The assistant is unavailable.');
    } finally { if (requestVersion.current === version) setThinking(false); }
  }

  return <details className="store-assistant">
    <summary><span className="store-assistant-icon" aria-hidden="true">✦</span>
      <span><strong>Find something with AI</strong><small>Describe what you need and review its suggestion</small></span>
      <span className="store-assistant-open" aria-hidden="true">+</span>
    </summary>
    <form onSubmit={suggest}>
      <label htmlFor="store-prompt">Describe your shopping list</label>
      <textarea id="store-prompt" value={prompt} rows={2} maxLength={2000} required disabled={thinking}
        placeholder="For example, coffee, two boxes of tea and bread" onChange={(event) => { setPrompt(event.target.value); setSuggestion(null); }} />
      {!token && <small>Connect and verify your wallet to use the assistant.</small>}
      <button type="submit" disabled={!token || thinking || disabled}>{thinking ? 'Finding products…' : 'Find products'}</button>
      {error && <p className="error" role="alert">{error}</p>}
      {suggestion && <div className="store-suggestion" role="status">
        {selections.map(({ item, product }) => <div key={item.product_id}>
          <strong>{product?.name ?? item.product_id}</strong>
          {product ? <small>{product.merchant_name} · Qty {item.quantity} · {fromYocto(product.price_yocto)} test NEAR each</small>
            : <small>Product unavailable. Refresh the catalog.</small>}
          {product && !product.merchant_ready && <small>Payment setup is needed for this merchant.</small>}
        </div>)}
        {suggestion.missing.length > 0 && <p>Not found or unclear: {suggestion.missing.join(', ')}</p>}
        {selections.length > 0 && <button className="secondary-button" type="button" disabled={!canAdd}
          onClick={() => { selections.forEach(({ item, product }) => { if (product) onAdd(product, item.quantity); }); setSuggestion(null); }}>Add selection</button>}
        {selections.length > 0 && !canAdd && <small>Check product availability and cart limits.</small>}
      </div>}
    </form>
  </details>;
}
