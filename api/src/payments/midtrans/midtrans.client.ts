import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MidtransChargeRequest,
  MidtransTransactionResponse,
} from './midtrans.types';

@Injectable()
export class MidtransClient {
  private readonly logger = new Logger(MidtransClient.name);
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(config: ConfigService) {
    const serverKey = config.getOrThrow<string>('MIDTRANS_SERVER_KEY');
    const isProduction =
      config.get<string>('MIDTRANS_IS_PRODUCTION') === 'true';

    this.baseUrl = isProduction
      ? 'https://api.midtrans.com'
      : 'https://api.sandbox.midtrans.com';
    this.authHeader =
      'Basic ' + Buffer.from(`${serverKey}:`).toString('base64');
  }

  async charge(
    body: MidtransChargeRequest,
  ): Promise<MidtransTransactionResponse> {
    const data = await this.request('POST', '/v2/charge', body);

    if (data.status_code !== '201') {
      this.logger.warn(
        `Charge rejected for ${body.transaction_details.order_id}: ${data.status_code} ${data.status_message}`,
      );
      throw new BadGatewayException('Payment provider rejected the charge');
    }

    return data;
  }

  async getStatus(
    orderId: string,
  ): Promise<MidtransTransactionResponse | null> {
    const data = await this.request(
      'GET',
      `/v2/${encodeURIComponent(orderId)}/status`,
    );

    if (data.status_code === '404') {
      return null;
    }

    if (!data.transaction_status) {
      throw new BadGatewayException('Could not get transaction status');
    }

    return data;
  }

  async cancel(orderId: string): Promise<MidtransTransactionResponse> {
    return this.request('POST', `/v2/${encodeURIComponent(orderId)}/cancel`);
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<MidtransTransactionResponse> {
    let res: Response;

    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: this.authHeader,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.logger.error(`Midtrans ${method} ${path} failed`, error as Error);
      throw new BadGatewayException('Payment provider is unreachable');
    }

    const data = (await res
      .json()
      .catch(() => null)) as MidtransTransactionResponse | null;

    if (!data?.status_code) {
      throw new BadGatewayException('Invalid response from payment provider');
    }

    return data;
  }
}
