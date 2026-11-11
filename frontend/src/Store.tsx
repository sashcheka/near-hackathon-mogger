import { useMemo, useState } from 'react';
import type { CartItem, Product } from './api';
import { fromYocto } from './amounts';
import { filterProducts, storePage } from './storeCatalog';
import type { StoreSort } from './storeCatalog';
import StoreAssistant from './StoreAssistant';

type Props = { products: Product[]; loading: boolean; error: string; onRefresh: () => void;
  cart: CartItem[]; token: string; onAdd: (product: Product, quantity: number) => void;
  onDecrease: (product: Product) => void; onCart: () => void };

export default function Store({ products, loading, error, onRefresh, cart, token, onAdd, onDecrease, onCart }: Props) {
  const [query, setQuery] = useState('');
  const [merchant, setMerchant] = useState('all');
  const [configuredOnly, setConfiguredOnly] = useState(false);
  const [sort, setSort] = useState<StoreSort>('name');
  const [page, setPage] = useState(1);
  const merchants = useMemo(() => [...new Map(products.map((p) => [p.merchant_id, p.merchant_name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1])), [products]);
  const filtered = useMemo(() => filterProducts(products, { query, merchant, configuredOnly, sort }),
    [products, query, merchant, configuredOnly, sort]);
  const results = storePage(filtered, page, 9);
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const activeFilters = !!query.trim() || merchant !== 'all' || configuredOnly;
  function clearFilters() { setQuery(''); setMerchant('all'); setConfiguredOnly(false); setSort('name'); setPage(1); }

  return <section className="marketplace" aria-labelledby="store-title" aria-busy={loading}>
    <div className="marketplace-heading">
      <div><span className="marketplace-kicker">THE MARKETPLACE <span aria-hidden="true">/</span> TESTNET</span>
        <h2 id="store-title">Find your essentials.</h2>
        <p>Browse products from independent demo merchants.</p></div>
      <button className="marketplace-cart" type="button" onClick={onCart}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M4 7h16l-1 13H5L4 7Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>
        </svg>
        Cart <span className="cart-count" aria-label={`${count} items`}>{count}</span>
      </button>
    </div>

    <StoreAssistant products={products} cart={cart} token={token} disabled={loading || !!error} onAdd={onAdd} />

    <div className="marketplace-toolbar">
      <div className="marketplace-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/>
        </svg>
        <label className="visually-hidden" htmlFor="store-search">Search products or merchants</label>
        <input id="store-search" type="search" value={query} placeholder="Search products or merchants"
          onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
      </div>
      <div className="marketplace-sort">
        <label htmlFor="store-sort">Sort by</label>
        <select id="store-sort" value={sort} onChange={(event) => { setSort(event.target.value as StoreSort); setPage(1); }}>
          <option value="name">Name</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option>
        </select>
      </div>
    </div>

    <div className="merchant-filters" role="group" aria-label="Filter by merchant">
      <span className="filter-label">SHOPS</span>
      <button type="button" className="merchant-filter" aria-pressed={merchant === 'all'}
        onClick={() => { setMerchant('all'); setPage(1); }}>All <span>{products.length}</span></button>
      {merchants.map(([id, name]) => <button type="button" className="merchant-filter" key={id} aria-pressed={merchant === id}
        onClick={() => { setMerchant(id); setPage(1); }}>{name} <span>{products.filter((p) => p.merchant_id === id).length}</span></button>)}
    </div>

    <div className="marketplace-results">
      <p role="status">{loading ? 'Loading products…' : error ? 'Could not load products.' :
        `${filtered.length} ${filtered.length === 1 ? 'product' : 'products'}${activeFilters ? ' found' : ''}`}</p>
      <div className="marketplace-result-actions">
        <label className="store-ready"><input type="checkbox" checked={configuredOnly}
          onChange={(event) => { setConfiguredOnly(event.target.checked); setPage(1); }} /> Payment configured</label>
        <button className="store-text-button" type="button" disabled={loading} onClick={onRefresh}>Refresh</button>
      </div>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {cart.length >= 20 && <small>A cart can contain up to 20 different products.</small>}
    {!loading && !error && filtered.length === 0 && <div className="store-empty">
      <strong>{products.length === 0 ? 'No products yet' : 'No matching products'}</strong>
      <p>{products.length === 0 ? 'The catalog is currently empty.' : 'Try another search or clear your filters.'}</p>
      {activeFilters && <button className="secondary-button" type="button" onClick={clearFilters}>Clear filters</button>}
    </div>}
    {!loading && !error && results.items.length > 0 && <>
      <ul className="store-grid">
        {results.items.map((product) => {
          const quantity = cart.find((item) => item.product_id === product.id)?.quantity ?? 0;
          const initials = product.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
          return <li className="store-product" key={product.id}>
            <div className="store-product-art" aria-hidden="true"><span>{initials}</span><i /></div>
            <div className="store-product-body">
              <small className="store-product-merchant">Sold by <strong>{product.merchant_name}</strong></small>
              <strong className="store-product-name">{product.name}</strong>
              {!product.merchant_ready && <small className="store-product-setup">Payment setup needed</small>}
              <div className="store-product-footer"><div><small>Price</small><span>{fromYocto(product.price_yocto)} <small>test NEAR</small></span></div>
                {quantity === 0 ? <button className="store-add" type="button" disabled={cart.length >= 20}
                  aria-label={`Add ${product.name} from ${product.merchant_name} to cart`} onClick={() => onAdd(product, 1)}>
                  <span aria-hidden="true">+</span> Add
                </button> : <div className="store-quantity" role="group" aria-label={`Quantity of ${product.name} from ${product.merchant_name}`}>
                  <button type="button" aria-label={`Decrease quantity of ${product.name}`} onClick={() => onDecrease(product)}>−</button>
                  <output aria-live="polite">{quantity}</output>
                  <button type="button" aria-label={`Increase quantity of ${product.name}`} disabled={quantity >= 1000}
                    onClick={() => onAdd(product, 1)}>+</button>
                </div>}
              </div>
            </div>
          </li>;
        })}
      </ul>
      {results.totalPages > 1 && <nav className="store-pagination" aria-label="Product pages">
        <button className="secondary-button" type="button" disabled={results.currentPage === 1}
          onClick={() => setPage(results.currentPage - 1)}>← Previous</button>
        <span>Page {results.currentPage} of {results.totalPages}</span>
        <button className="secondary-button" type="button" disabled={results.currentPage === results.totalPages}
          onClick={() => setPage(results.currentPage + 1)}>Next →</button>
      </nav>}
    </>}
  </section>;
}
