import { createHash, timingSafeEqual } from 'crypto';

export function isValidMidtransSignature(
  payload: Record<string, unknown>,
  serverKey: string,
): boolean {
  const { order_id, status_code, gross_amount, signature_key } = payload;

  if (
    typeof order_id !== 'string' ||
    typeof status_code !== 'string' ||
    typeof gross_amount !== 'string' ||
    typeof signature_key !== 'string'
  ) {
    return false;
  }

  const expected = createHash('sha512')
    .update(order_id + status_code + gross_amount + serverKey)
    .digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(signature_key);

  return a.length === b.length && timingSafeEqual(a, b);
}
