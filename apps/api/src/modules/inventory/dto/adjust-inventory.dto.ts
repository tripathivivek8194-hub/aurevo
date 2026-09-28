import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdjustInventoryDto {
  @ApiProperty({ example: 10, description: 'Positive to add, negative to subtract' })
  @IsNumber()
  adjustment: number;

  @ApiProperty({ example: 'Restocked from supplier', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}