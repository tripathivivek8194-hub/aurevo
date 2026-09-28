import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body for POST /payments/verify — the three fields the Razorpay Checkout
 * `handler` callback returns after a successful payment. The signature is
 * verified server-side (HMAC-SHA256 of `razorpay_order_id|razorpay_payment_id`
 * with RAZORPAY_KEY_SECRET) before any state is changed.
 *
 * No amount/currency fields: the authority is always the stored Payment row,
 * cross-checked against a server-side fetch of the Razorpay payment.
 */
export class VerifyPaymentDto {
  @ApiProperty({ example: 'order_xxxx' })
  @IsString()
  @MinLength(1)
  razorpay_order_id: string;

  @ApiProperty({ example: 'pay_xxxx' })
  @IsString()
  @MinLength(1)
  razorpay_payment_id: string;

  @ApiProperty({ example: 'sig_xxxx' })
  @IsString()
  @MinLength(1)
  razorpay_signature: string;
}
