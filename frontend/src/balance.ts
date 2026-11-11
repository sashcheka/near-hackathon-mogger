import { fromYocto } from './amounts.ts';

export function formatBalance(amount: string): string {
  const [whole, fraction = ''] = fromYocto(amount).split('.');
  if (fraction.length <= 6) return fraction ? `${whole}.${fraction}` : whole;
  const shortened = fraction.slice(0, 6).replace(/0+$/, '');
  if (whole === '0' && !shortened) return '< 0.000001';
  return `≈ ${whole}${shortened ? `.${shortened}` : ''}`;
}
