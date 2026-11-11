import type { Product } from './api';

export type StoreSort = 'name' | 'price-asc' | 'price-desc';
export type StoreFilters = { query: string; merchant: string; configuredOnly: boolean; sort: StoreSort };

export function filterProducts(products: Product[], filters: StoreFilters): Product[] {
  const query = filters.query.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  const result = products.filter((product) => {
    const text = `${product.name} ${product.merchant_name}`.toLocaleLowerCase();
    return (filters.merchant === 'all' || product.merchant_id === filters.merchant) &&
      (!filters.configuredOnly || product.merchant_ready) && text.includes(query);
  });
  return result.sort((a, b) => {
    if (filters.sort !== 'name') {
      const left = BigInt(a.price_yocto);
      const right = BigInt(b.price_yocto);
      const difference = left < right ? -1 : left > right ? 1 : 0;
      if (difference) return filters.sort === 'price-asc' ? difference : -difference;
    }
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}

export function storePage<T>(items: T[], page: number, size: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  return { items: items.slice((currentPage - 1) * size, currentPage * size), currentPage, totalPages };
}
