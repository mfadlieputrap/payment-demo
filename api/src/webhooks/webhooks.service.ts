import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { MidtransClient } from '../payments/midtrans/midtrans.client';
import { isValidMidtransSignature } from './midtrans-signature';
import { PaymentSettlementService } from 'src/payments/payment-settlement.service';
import { mapMidtransStatus } from 'src/payments/midtrans/map-status';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly serverKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly midtrans: MidtransClient,
    private readonly settlement: PaymentSettlementService,
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

    const payment = await this.prisma.payment.findUnique({
      where: { providerOrderId },
    });

    if (!payment) {
      this.logger.warn(`Webhook for unknown payment ${providerOrderId}`);
      return { received: true };
    }

    const status = await this.midtrans.getStatus(providerOrderId);
    if (!status) {
      return { received: true };
    }

    const newStatus = mapMidtransStatus(status);
    if (!newStatus) {
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
        const result = await this.settlement.markPaid(tx, payment);
        this.logger.log(`Webhook settled ${providerOrderId}: ${result}`);
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
