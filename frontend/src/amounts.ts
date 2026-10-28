export function toYocto(near: string): string {
  if (!/^(0|[1-9]\d*)(?:\.\d{1,24})?$/.test(near)) {
    throw new Error('Enter a positive budget with up to 24 decimal places.');
  }
  const [whole, fraction = ''] = near.split('.');
  const amount = (whole + fraction.padEnd(24, '0')).replace(/^0+/, '');
  if (!amount || amount.length > 39) {
    throw new Error('Budget must be positive and less than 1,000,000,000,000,000 NEAR.');
  }
  return amount;
}

export function fromYocto(amount: string): string {
  const padded = amount.padStart(25, '0');
  const fraction = padded.slice(-24).replace(/0+$/, '');
  return padded.slice(0, -24) + (fraction ? `.${fraction}` : '');
}
