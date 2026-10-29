import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

export type SettlementResult = 'paid' | 'late' | 'already';

interface SettlablePayment {
  id: string;
  orderId: string;
  providerOrderId: string;
}

@Injectable()
export class PaymentSettlementService {
  private readonly logger = new Logger(PaymentSettlementService.name);

  async markPaid(
    tx: Prisma.TransactionClient,
    payment: SettlablePayment,
  ): Promise<SettlementResult> {
    const now = new Date();

    const { count: paymentUpdated } = await tx.payment.updateMany({
      where: { id: payment.id, status: { not: 'SUCCESS' } },
      data: { status: 'SUCCESS', paidAt: now },
    });

    if (paymentUpdated === 0) {
      return 'already';
    }

    const { count: orderUpdated } = await tx.order.updateMany({
      where: { id: payment.orderId, status: 'PENDING_PAYMENT' },
      data: { status: 'PAID', paidAt: now },
    });

    if (orderUpdated === 0) {
      this.logger.error(
        `LATE PAYMENT: ${payment.providerOrderId} paid but order is not longer pending. Needs manual refund.`,
      );
      return 'late';
    }

    return 'paid';
  }
}
