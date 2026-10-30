import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { OrderExpiryJob } from './order-expiry.job';

@Module({
  imports: [PaymentsModule],
  providers: [OrderExpiryJob],
})
export class JobsModule {}
