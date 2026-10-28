import { Module } from '@nestjs/common';
import { MidtransClient } from './midtrans/midtrans.client';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

@Module({
  providers: [MidtransClient, PaymentsService],
  controllers: [PaymentsController],
})
export class PaymentsModule {}
