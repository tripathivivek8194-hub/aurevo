import { IsString, IsIn, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateOrderStatusDto {
  @ApiProperty({ example: 'PAID', enum: ['PENDING', 'PAYMENT_PENDING', 'PAID', 'PROCESSING', 'FULFILLMENT', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED', 'FAILED', 'RETURNED'] })
  @IsIn(['PENDING', 'PAYMENT_PENDING', 'PAID', 'PROCESSING', 'FULFILLMENT', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED', 'FAILED', 'RETURNED'])
  status: string;

  @ApiProperty({ example: 'Payment received', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}