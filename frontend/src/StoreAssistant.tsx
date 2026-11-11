import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { suggestProduct } from './api';
import type { CartItem, Product } from './api';
import { fromYocto } from './amounts';

type Props = { products: Product[]; cart: CartItem[]; token: string; disabled: boolean;
  onAdd: (product: Product, quantity: number) => void };

export default function StoreAssistant({ products, cart, token, disabled, onAdd }: Props) {
  const [prompt, setPrompt] = useState('');
  const [suggestion, setSuggestion] = useState<CartItem | null>(null);
  const [error, setError] = useState('');
  const [thinking, setThinking] = useState(false);
  const requestVersion = useRef(0);
  useEffect(() => {
    setSuggestion(null);
    setError('');
    setThinking(false);
    return () => { ++requestVersion.current; };
  }, [token]);
  const selected = products.find((product) => product.id === suggestion?.product_id);
  const selectedQuantity = cart.find((item) => item.product_id === selected?.id)?.quantity ?? 0;
  const canAdd = !!selected && !!suggestion && selectedQuantity + suggestion.quantity <= 1000 &&
    (selectedQuantity > 0 || cart.length < 20);

  async function suggest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || thinking) return;
    const version = ++requestVersion.current;
    setThinking(true);
    setSuggestion(null);
    setError('');
    try {
      const result = await suggestProduct(token, prompt.trim());
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
      <label htmlFor="store-prompt">Describe one product</label>
      <textarea id="store-prompt" value={prompt} rows={2} maxLength={2000} required disabled={thinking}
        placeholder="For example, unsweetened oat milk" onChange={(event) => { setPrompt(event.target.value); setSuggestion(null); }} />
      {!token && <small>Connect and verify your wallet to use the assistant.</small>}
      <button type="submit" disabled={!token || thinking || disabled}>{thinking ? 'Finding a product…' : 'Find a product'}</button>
      {error && <p className="error" role="alert">{error}</p>}
      {suggestion && <div className="store-suggestion" role="status">
        {selected ? <><strong>{selected.name}</strong><small>{selected.merchant_name} · Qty {suggestion.quantity} · {fromYocto(selected.price_yocto)} test NEAR each</small>
          {!selected.merchant_ready && <small>Payment setup is needed for this merchant.</small>}
          <button className="secondary-button" type="button" disabled={!canAdd}
            onClick={() => { onAdd(selected, suggestion.quantity); setSuggestion(null); }}>Add selection</button>
          {!canAdd && <small>Cart quantity or product limit reached.</small>}</>
          : <p>This product is no longer available. Refresh the catalog.</p>}
      </div>}
    </form>
  </details>;
}
