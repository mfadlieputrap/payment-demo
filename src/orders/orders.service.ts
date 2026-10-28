import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { generateOrderNumber } from 'src/common/utils/order-number';

const ORDER_TTL_MINUTES = 15;

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrderDto) {
    const productIds = dto.items.map((item) => item.productId);

    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException(
        'Each product may only appear once in items',
      );
    }

    const items = [...dto.items].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    );

    return this.prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, isActive: true },
        select: { id: true, name: true, price: true },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      const missing = productIds.filter((id) => !productMap.has(id));
      if (missing.length > 0) {
        throw new NotFoundException(
          `Products not found: ${missing.join(', ')}`,
        );
      }

      for (const item of items) {
        const { count } = await tx.product.updateMany({
          where: {
            id: item.productId,
            isActive: true,
            stock: { gte: item.quantity },
          },
          data: { stock: { decrement: item.quantity } },
        });

        if (count === 0) {
          const name = productMap.get(item.productId)!.name;
          throw new ConflictException(`Insufficient stock for ${name}`);
        }
      }

      const orderItems = items.map((item) => {
        const product = productMap.get(item.productId)!;
        return {
          productId: product.id,
          productName: product.name,
          unitPrice: product.price,
          quantity: item.quantity,
          subtotal: product.price * BigInt(item.quantity),
        };
      });

      const totalAmount = orderItems.reduce((sum, i) => sum + i.subtotal, 0n);

      return tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          customerName: dto.customerName,
          customerEmail: dto.customerEmail,
          customerPhone: dto.customerPhone,
          totalAmount,
          expiresAt: new Date(Date.now() + ORDER_TTL_MINUTES * 60 * 1000),
          items: { create: orderItems },
        },
        select: {
          orderNumber: true,
          status: true,
          totalAmount: true,
          expiresAt: true,
          items: {
            select: {
              productName: true,
              unitPrice: true,
              quantity: true,
              subtotal: true,
            },
          },
        },
      });
    });
  }

  async findByOrderNumber(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      select: {
        orderNumber: true,
        status: true,
        totalAmount: true,
        expiresAt: true,
        paidAt: true,
        items: {
          select: {
            productName: true,
            unitPrice: true,
            quantity: true,
            subtotal: true,
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            method: true,
            status: true,
            qrString: true,
            vaNumber: true,
            expiresAt: true,
            qrImageUrl: true,
            amount: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderNumber} not found`);
    }

    const { payments, ...rest } = order;
    return { ...rest, latestPayment: payments[0] ?? null };
  }
}
