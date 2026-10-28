/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { MidtransClient } from './midtrans/midtrans.client';
import { PaymentMethod } from 'src/generated/prisma/enums';
import { Payment } from 'src/generated/prisma/client';
import { MidtransChargeRequest } from './midtrans/midtrans.types';

const MIN_PAYMENT_WINDOW_MS = 60_000;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly midtrans: MidtransClient,
  ) {}

  async create(orderNumber: string, method: PaymentMethod) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: {
        items: true,
        payments: {
          where: { status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderNumber} not found`);
    }

    if (order.status !== 'PENDING_PAYMENT') {
      throw new ConflictException(
        `Order is ${order.status}, not awaiting payment`,
      );
    }

    const remainingMs = order.expiresAt.getTime() - Date.now();
    if (remainingMs < MIN_PAYMENT_WINDOW_MS) {
      throw new ConflictException(
        'Order is about to expire, please create a new order',
      );
    }

    const sameMethod = order.payments.find((p) => p.method === method);
    if (sameMethod) {
      return this.toResponse(sameMethod);
    }

    for (const oldPayment of order.payments) {
      await this.cancelPending(oldPayment);
    }

    const attempt =
      (await this.prisma.payment.count({ where: { orderId: order.id } })) + 1;
    const expiryMinutes = Math.floor(remainingMs / 60_000);

    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        method,
        providerOrderId: `${order.orderNumber}-P${attempt}`,
        amount: order.totalAmount,
        expiresAt: new Date(Date.now() + expiryMinutes * 60_000),
      },
    });

    const base: Omit<MidtransChargeRequest, 'payment_type'> = {
      transaction_details: {
        order_id: payment.providerOrderId,
        gross_amount: Number(order.totalAmount),
      },
      customer_details: {
        first_name: order.customerName,
        email: order.customerEmail,
        phone: order.customerPhone,
      },
      item_details: order.items.map((item) => ({
        id: item.productId,
        name: item.productName.slice(0, 50),
        price: Number(item.unitPrice),
        quantity: item.quantity,
      })),
      custom_expiry: {
        expiry_duration: expiryMinutes,
        unit: 'minute',
      },
    };

    const request: MidtransChargeRequest =
      method === 'QRIS'
        ? { ...base, payment_type: 'qris', qris: { acquirer: 'gopay' } }
        : {
            ...base,
            payment_type: 'bank_transfer',
            bank_transfer: { bank: 'bca' },
          };

    let response;
    try {
      response = await this.midtrans.charge(request);
    } catch (error) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });
      throw error;
    }

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerRef: response.transaction_id,
        qrString: response.qr_string,
        qrImageUrl: response.actions?.find((a) => a.name === 'generate-qr-code')
          ?.url,
        vaNumber: response.va_numbers?.[0]?.va_number,
        rawResponse: response,
      },
    });

    return this.toResponse(updated);
  }

  private async cancelPending(payment: Payment) {
    const result = await this.midtrans.cancel(payment.providerOrderId);

    if (result.status_code === '200') {
      await this.markStatus(payment.id, 'CANCELLED');
      return;
    }

    // Charge-nya nggak pernah sampai ke Midtrans
    if (result.status_code === '404') {
      await this.markStatus(payment.id, 'FAILED');
      return;
    }

    // Cancel ditolak: cek status aslinya sebelum memutuskan
    const status = await this.midtrans.getStatus(payment.providerOrderId);

    if (status.transaction_status === 'expire') {
      await this.markStatus(payment.id, 'EXPIRED');
      return;
    }

    if (status.transaction_status === 'cancel') {
      await this.markStatus(payment.id, 'CANCELLED');
      return;
    }

    this.logger.warn(
      `Could not cancel ${payment.providerOrderId}: ${status.transaction_status}`,
    );
    throw new ConflictException(
      'Previous payment could not be cancelled, please try again',
    );
  }

  private markStatus(id: string, status: 'CANCELLED' | 'FAILED' | 'EXPIRED') {
    return this.prisma.payment.update({ where: { id }, data: { status } });
  }

  private toResponse(payment: Payment) {
    return {
      method: payment.method,
      status: payment.status,
      amount: payment.amount,
      qrString: payment.qrString,
      qrImageUrl: payment.qrImageUrl,
      vaNumber: payment.vaNumber,
      expiresAt: payment.expiresAt,
    };
  }
}
