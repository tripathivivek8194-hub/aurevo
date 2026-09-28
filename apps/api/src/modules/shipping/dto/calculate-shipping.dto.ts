import { IsString, IsNumber, IsInt, IsOptional, Min, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CalculateShippingDto {
  @ApiProperty({ example: 'US' })
  @IsString()
  @MinLength(2)
  @MaxLength(2)
  country: string;

  @ApiProperty({ example: 'NY' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  state: string;

  @ApiProperty({ example: '10001' })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  postalCode: string;

  @ApiProperty({ example: 29999, description: 'Subtotal in paise/cents (integer)' })
  @IsInt()
  @Min(0)
  subtotal: number;

  @ApiProperty({ example: 3, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  itemCount?: number;

  @ApiProperty({ example: 1.5, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalWeight?: number;
}