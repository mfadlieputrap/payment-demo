import { Body, Controller, Param, Post } from '@nestjs/common';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentsService } from './payments.service';

@Controller('orders/:orderNumber/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  create(
    @Param('orderNumber') orderNumber: string,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentsService.create(orderNumber, dto.method);
  }
}
