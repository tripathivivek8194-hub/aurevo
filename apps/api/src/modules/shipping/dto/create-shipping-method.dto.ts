import { IsString, MinLength, MaxLength, IsOptional, IsInt, IsBoolean, Min, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateShippingMethodDto {
  @ApiProperty({ example: 'Standard Shipping' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'standard' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code: string;

  @ApiProperty({ example: 'Standard delivery within 5-7 business days', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: 9900, description: 'Base cost in paise/cents (integer)' })
  @IsInt()
  @Min(0)
  baseCost: number;

  @ApiProperty({ example: 1000, required: false, description: 'Per-item cost in paise/cents' })
  @IsOptional()
  @IsInt()
  @Min(0)
  perItemCost?: number;

  @ApiProperty({ example: 2000, required: false, description: 'Per-kg cost in paise/cents' })
  @IsOptional()
  @IsInt()
  @Min(0)
  perKgCost?: number;

  @ApiProperty({ example: 99900, required: false, description: 'Free shipping threshold in paise/cents' })
  @IsOptional()
  @IsInt()
  @Min(0)
  freeShippingThreshold?: number;

  @ApiProperty({ example: 10000, required: false, description: 'Min order amount in paise/cents' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minOrderAmount?: number;

  @ApiProperty({ example: 5000000, required: false, description: 'Max order amount in paise/cents' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxOrderAmount?: number;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  estimatedDays: number;

  @ApiProperty({ example: 'INR' })
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ example: ['clx123...', 'clx456...'], required: false, description: 'Zone ids (Prisma cuid)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  zoneIds?: string[];
}