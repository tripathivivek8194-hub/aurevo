import { IsString, MinLength, MaxLength, IsOptional, IsInt, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateVariantDto {
  @ApiProperty({ example: 'Red / Large', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiProperty({ example: 'PROD-RED-L', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sku?: string;

  @ApiProperty({ example: 2999, description: 'Price in minor units (paise/cents)', required: false })
  @IsOptional()
  @IsInt()
  price?: number;

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