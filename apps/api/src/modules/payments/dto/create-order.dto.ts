import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body for POST /payments/create-order.
 *
 * Deliberately contains ONLY `orderId` — the amount/currency handed to Razorpay
 * are derived server-side from the order row (A5). A client can never inject an
 * amount, so a tampered total can never reach the payment provider.
 */
export class CreatePaymentOrderDto {
  @ApiProperty({ example: 'clx123...', description: 'Order id (Prisma cuid)' })
  @IsString()
  @MinLength(1)
  orderId: string;
}
