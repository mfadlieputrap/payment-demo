import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { MidtransClient } from '../payments/midtrans/midtrans.client';
import { MidtransTransactionResponse } from '../payments/midtrans/midtrans.types';
import { isValidMidtransSignature } from './midtrans-signature';

type FinalStatus = 'SUCCESS' | 'EXPIRED' | 'FAILED' | 'CANCELLED';

function mapStatus(res: MidtransTransactionResponse): FinalStatus | null {
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

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly serverKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly midtrans: MidtransClient,
    config: ConfigService,
  ) {
    this.serverKey = config.getOrThrow<string>('MIDTRANS_SERVER_KEY');
  }

  async handleMidtrans(payload: Record<string, unknown>) {
    if (!isValidMidtransSignature(payload, this.serverKey)) {
      this.logger.warn(
        `Invalid signature for order_id=${String(payload.order_id)}`,
      );
      throw new UnauthorizedException('Invalid signature');
    }

    const providerOrderId = payload.order_id as string;

    const status = await this.midtrans.getStatus(providerOrderId);
    const newStatus = mapStatus(status);
    if (!newStatus) {
      return { received: true };
    }

    const payment = await this.prisma.payment.findUnique({
      where: { providerOrderId },
    });
    if (!payment) {
      this.logger.warn(`Webhook for unknown payment ${providerOrderId}`);
      return { received: true };
    }

    const paidAmount = BigInt(Math.round(Number(status.gross_amount)));
    if (paidAmount !== payment.amount) {
      this.logger.error(
        `Amount mismatch for ${providerOrderId}: expected ${payment.amount}, got ${paidAmount}`,
      );
      return { received: true };
    }

    const eventKey = `${status.transaction_id}:${status.transaction_status}`;

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.webhookEvent.createMany({
        data: [
          {
            provider: 'MIDTRANS',
            eventKey,
            payload: payload as Prisma.InputJsonValue,
          },
        ],
        skipDuplicates: true,
      });

      if (count === 0) {
        this.logger.log(`Duplicate webhook ${eventKey}, skipped`);
        return;
      }

      if (newStatus === 'SUCCESS') {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'SUCCESS', paidAt: new Date() },
        });

        const { count: orderUpdated } = await tx.order.updateMany({
          where: { id: payment.orderId, status: 'PENDING_PAYMENT' },
          data: { status: 'PAID', paidAt: new Date() },
        });

        if (orderUpdated === 0) {
          this.logger.error(
            `LATE PAYMENT: ${providerOrderId} paid but order is no longer pending. Needs manual refund.`,
          );
        }
        return;
      }

      await tx.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: { status: newStatus },
      });
    });

    return { received: true };
  }
}
