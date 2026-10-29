import { MidtransTransactionResponse } from './midtrans.types';

export type FinalPaymentStatus = 'SUCCESS' | 'EXPIRED' | 'FAILED' | 'CANCELLED';

export function mapMidtransStatus(
  res: MidtransTransactionResponse,
): FinalPaymentStatus | null {
  switch (res.transaction_status) {
    case 'settlement':
      return 'SUCCESS';
    case 'capture':
      return res.fraud_status === 'accept' ? 'SUCCESS' : null;
    case 'expire':
      return 'EXPIRED';
    case 'cancel':
      return 'CANCELLED';
    case 'deny':
    case 'failure':
      return 'FAILED';
    default:
      return null;
  }
}
