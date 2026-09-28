import { IsString, MinLength, MaxLength, IsOptional, IsBoolean, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Electronics' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'electronics' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  slug: string;

  @ApiProperty({ example: 'Electronic devices and accessories', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: 'https://example.com/electronics.jpg', required: false })
  @IsOptional()
  @IsUrl()
  image?: string;

  @ApiProperty({ example: 'parent-category-id', required: false })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  sortOrder?: number;
}