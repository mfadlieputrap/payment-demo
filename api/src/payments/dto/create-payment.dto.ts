import { IsEnum } from 'class-validator';
import { PaymentMethod } from 'src/generated/prisma/enums';

export class CreatePaymentDto {
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;
}
