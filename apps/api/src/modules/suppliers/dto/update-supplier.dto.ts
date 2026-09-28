import { IsString, MinLength, MaxLength, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateSupplierDto {
  @ApiProperty({ example: 'AliExpress', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiProperty({ example: 'contact@supplier.com or +1 234 567 8900', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  contact?: string;

  @ApiProperty({ example: 'Primary electronics vendor', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiProperty({ example: { appKey: '...', appSecret: '...' }, required: false })
  @IsOptional()
  apiConfig?: Record<string, any>;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  syncEnabled?: boolean;
}