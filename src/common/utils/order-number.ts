import { randomInt } from 'crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateOrderNumber(now: Date = new Date()): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');

  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += ALPHABET[randomInt(ALPHABET.length)];
  }

  return `ORD-${date}-${suffix}`;
}
