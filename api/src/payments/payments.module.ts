import { Module } from '@nestjs/common';
import { MidtransClient } from './midtrans/midtrans.client';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentSettlementService } from './payment-settlement.service';

@Module({
  providers: [MidtransClient, PaymentsService, PaymentSettlementService],
  controllers: [PaymentsController],
  exports: [MidtransClient, PaymentSettlementService],
})
export class PaymentsModule {}
