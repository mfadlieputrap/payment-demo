import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from 'src/generated/prisma/client';
import {
  FinalPaymentStatus,
  mapMidtransStatus,
} from 'src/payments/midtrans/map-status';
import { MidtransClient } from 'src/payments/midtrans/midtrans.client';
import { PaymentSettlementService } from 'src/payments/payment-settlement.service';
import { PrismaService } from 'src/prisma/prisma.service';

const BATCH_SIZE = 50;

const expiringOrderSelect = {
  id: true,
  orderNumber: true,
  items: { select: { productId: true, quantity: true } },
  payments: {
    where: { status: 'PENDING' },
    select: { id: true, orderId: true, providerOrderId: true },
  },
} satisfies Prisma.OrderSelect;

type ExpiringOrder = Prisma.OrderGetPayload<{
  select: typeof expiringOrderSelect;
}>;

@Injectable()
export class OrderExpiryJob {
  private readonly logger = new Logger(OrderExpiryJob.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly midtrans: MidtransClient,
    private readonly settlement: PaymentSettlementService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run() {
    if (this.running) {
      return;
    }
    this.running = true;

    try {
      const orders = await this.prisma.order.findMany({
        where: { status: 'PENDING_PAYMENT', expiresAt: { lt: new Date() } },
        select: expiringOrderSelect,
        orderBy: { expiresAt: 'asc' },
        take: BATCH_SIZE,
      });

      for (const order of orders) {
        try {
          await this.processOrder(order);
        } catch (error) {
          this.logger.error(
            `Failed to process ${order.orderNumber}`,
            error as Error,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async processOrder(order: ExpiringOrder) {
    const finalStatuses = await this.resolvePaymentStatuses(order);

    const paidPayment = order.payments.find(
      (p) => finalStatuses.get(p.id) === 'SUCCESS',
    );

    if (paidPayment) {
      await this.prisma.$transaction(async (tx) => {
        const result = await this.settlement.markPaid(tx, paidPayment);
        this.logger.log(
          `Reconciled ${order.orderNumber} from Midtrans: ${result}`,
        );
        await this.applyPaymentStatuses(tx, finalStatuses, paidPayment.id);
      });
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: order.id, status: 'PENDING_PAYMENT' },
        data: { status: 'EXPIRED' },
      });

      if (count === 0) {
        return;
      }

      const items = [...order.items].sort((a, b) =>
        a.productId.localeCompare(b.productId),
      );

      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }

      await this.applyPaymentStatuses(tx, finalStatuses);
      this.logger.log(`Expired ${order.orderNumber}, stock restored`);
    });
  }

  private async resolvePaymentStatuses(order: ExpiringOrder) {
    const statuses = new Map<string, FinalPaymentStatus>();

    for (const payment of order.payments) {
      const status = await this.midtrans.getStatus(payment.providerOrderId);

      if (!status) {
        statuses.set(payment.id, 'FAILED');
        continue;
      }

      const mapped = mapMidtransStatus(status);
      if (mapped) {
        statuses.set(payment.id, mapped);
        continue;
      }

      const cancel = await this.midtrans.cancel(payment.providerOrderId);
      if (cancel.status_code !== '200') {
        throw new Error(
          `Could not cancel ${payment.providerOrderId}: ${cancel.status_code}`,
        );
      }
      statuses.set(payment.id, 'CANCELLED');
    }

    return statuses;
  }

  private async applyPaymentStatuses(
    tx: Prisma.TransactionClient,
    statuses: Map<string, FinalPaymentStatus>,
    skipPaymentId?: string,
  ) {
    for (const [paymentId, status] of statuses) {
      if (paymentId === skipPaymentId) {
        continue;
      }
      await tx.payment.updateMany({
        where: { id: paymentId, status: 'PENDING' },
        data: { status },
      });
    }
  }
}
