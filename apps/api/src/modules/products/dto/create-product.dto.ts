import { IsString, MinLength, MaxLength, IsOptional, IsInt, IsBoolean, IsUrl, IsArray, ValidateNested, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ProductStatus } from '@aurevo/shared/types';

export class CreateProductImageDto {
  @ApiProperty({ example: 'https://example.com/image.jpg' })
  @IsUrl()
  url: string;

  @ApiProperty({ example: 'Product image', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  alt?: string;
}

export class CreateProductVariantDto {
  @ApiProperty({ example: 'Red / Large' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'PROD-RED-L' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sku: string;

  @ApiProperty({ example: 2999, description: 'Price in minor units (paise/cents)' })
  @IsInt()
  price: number;

  @ApiProperty({ example: 3999, description: 'Compare-at price in minor units (paise/cents)', required: false })
  @IsOptional()
  @IsInt()
  compareAtPrice?: number;

  @ApiProperty({ example: 500, description: 'Weight in grams', required: false })
  @IsOptional()
  @IsInt()
  weight?: number;

  @ApiProperty({ example: { length: 10, width: 5, height: 2 }, required: false })
  @IsOptional()
  dimensions?: Record<string, number>;

  @ApiProperty({ example: { color: 'Red', size: 'L' }, required: false })
  @IsOptional()
  attributes?: Record<string, string>;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Wireless Headphones' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'wireless-headphones', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  slug?: string;

  @ApiProperty({ example: 'High-quality wireless headphones with noise cancellation' })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description: string;

  @ApiProperty({ example: 'Premium wireless headphones', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescription?: string;

  @ApiProperty({ example: 'WH-1000XM5' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sku: string;

  @ApiProperty({ example: 29999, description: 'Base/sell price in minor units (paise/cents)' })
  @IsInt()
  basePrice: number;

  @ApiProperty({ example: 20000, description: 'Landed cost in minor units (paise/cents). Required before product can be set ACTIVE.', required: false })
  @IsOptional()
  @IsInt()
  cost?: number;

  @ApiProperty({ example: 34999, description: 'Compare-at price in minor units (paise/cents)', required: false })
  @IsOptional()
  @IsInt()
  compareAtPrice?: number;

  @ApiProperty({ example: 'INR' })
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency: string;

  @ApiProperty({ example: 'ACTIVE', enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'], required: false })
  @IsOptional()
  @IsIn(['DRAFT', 'ACTIVE', 'ARCHIVED'])
  status?: ProductStatus;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiProperty({ example: 'clx123...', description: 'Category id (Prisma cuid)' })
  @IsString()
  @MinLength(1)
  categoryId: string;

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

  @ApiProperty({ type: [CreateProductImageDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductImageDto)
  images?: CreateProductImageDto[];

  @ApiProperty({ type: [CreateProductVariantDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariantDto)
  variants?: CreateProductVariantDto[];

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

  @ApiProperty({ example: { material: 'Plastic', warranty: '1 year' }, required: false })
  @IsOptional()
  metadata?: Record<string, any>;

  @ApiProperty({ example: 'Set of 2 — 2 storage containers with lids', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  packageContents?: string;
}
