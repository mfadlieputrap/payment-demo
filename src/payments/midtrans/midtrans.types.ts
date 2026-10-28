export type MidtransTransactionStatus =
  | 'pending'
  | 'settlement'
  | 'capture'
  | 'expire'
  | 'cancel'
  | 'deny'
  | 'refund'
  | 'partial_refund'
  | 'failure';

export interface MidtransChargeRequest {
  payment_type: 'qris' | 'bank_transfer';
  transaction_details: {
    order_id: string;
    gross_amount: number;
  };
  customer_details?: {
    first_name?: string;
    email?: string;
    phone?: string;
  };
  item_details?: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
  }>;
  qris?: { acquirer: 'gopay' };
  bank_transfer?: { bank: 'bca' };
  custom_expiry?: {
    order_time?: string;
    expiry_duration: number;
    unit: 'second' | 'minute' | 'hour' | 'day';
  };
}

// Semua field opsional kecuali status_code: jangan percaya bentuk response 100%
export interface MidtransTransactionResponse {
  status_code: string;
  status_message?: string;
  transaction_id?: string;
  order_id?: string;
  gross_amount?: string;
  payment_type?: string;
  transaction_status?: MidtransTransactionStatus;
  fraud_status?: string;
  va_numbers?: Array<{ bank: string; va_number: string }>;
  actions?: Array<{ name: string; method: string; url: string }>;
  qr_string?: string;
  expiry_time?: string;
}
