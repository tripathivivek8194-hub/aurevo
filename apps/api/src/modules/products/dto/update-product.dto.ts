import { IsString, MinLength, MaxLength, IsOptional, IsInt, IsBoolean, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ProductStatus } from '@aurevo/shared/types';

export class UpdateProductDto {
  @ApiProperty({ example: 'Wireless Headphones', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiProperty({ example: 'wireless-headphones', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  slug?: string;

  @ApiProperty({ example: 'High-quality wireless headphones', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ example: 'Premium wireless headphones', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescription?: string;

  @ApiProperty({ example: 'WH-1000XM5', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sku?: string;

  @ApiProperty({ example: 29999, description: 'Base/sell price in minor units (paise/cents)', required: false })
  @IsOptional()
  @IsInt()
  basePrice?: number;

  @ApiProperty({ example: 20000, description: 'Landed cost in minor units (paise/cents). Required before product can be set ACTIVE.', required: false })
  @IsOptional()
  @IsInt()
  cost?: number;

  @ApiProperty({ example: 34999, description: 'Compare-at price in minor units (paise/cents)', required: false })
  @IsOptional()
  @IsInt()
  compareAtPrice?: number;

  @ApiProperty({ example: 'INR', required: false })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @ApiProperty({ example: 'ACTIVE', enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'], required: false })
  @IsOptional()
  @IsIn(['DRAFT', 'ACTIVE', 'ARCHIVED'])
  status?: ProductStatus;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiProperty({ example: 'clx123...', description: 'Category id (Prisma cuid)', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  categoryId?: string;

  @ApiProperty({ example: 'clx456...', description: 'Supplier id (Prisma cuid)', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  supplierId?: string;

  @ApiProperty({ example: 'supplier-product-123', required: false })
  @IsOptional()
  @IsString()
  supplierProductId?: string;

  @ApiProperty({ example: 'supplier-variant-456', required: false })
  @IsOptional()
  @IsString()
  supplierVariantId?: string;

  @ApiProperty({ example: { material: 'Plastic' }, required: false })
  @IsOptional()
  metadata?: Record<string, any>;

  @ApiProperty({ example: 'Set of 2 — 2 storage containers with lids', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  packageContents?: string;

  @ApiProperty({ example: 100, required: false })
  @IsOptional()
  @IsInt()
  initialQuantity?: number;

  @ApiProperty({ example: 10, required: false })
  @IsOptional()
  @IsInt()
  lowStockThreshold?: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  trackQuantity?: boolean;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  allowBackorder?: boolean;
}
