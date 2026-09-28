import { IsString, IsOptional, IsInt, Min, Max, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddToCartDto {
  @ApiProperty({ example: 'clx123...', description: 'Product id (Prisma cuid)' })
  @IsString()
  @MinLength(1)
  productId: string;

  @ApiProperty({ example: 'clx456...', description: 'Variant id (Prisma cuid)', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  variantId?: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: 99 })
  @IsInt()
  @Min(1)
  @Max(99)
  quantity: number;
}
