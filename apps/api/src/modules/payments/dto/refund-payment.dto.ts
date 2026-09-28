import { IsOptional, IsString, IsInt, Min, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body for POST /payments/:id/refund (admin only).
 *
 * `amount` is in the app-wide integer paise unit — never multiplied by 100.
 * Omit it to refund the full payment.
 */
export class RefundPaymentDto {
  @ApiProperty({ example: 25000, required: false, description: 'Refund amount in paise; omitted = full refund' })
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @ApiProperty({ example: 'Customer requested refund', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
