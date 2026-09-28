import { IsString, MinLength, MaxLength, IsOptional, IsBoolean, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddressDto {
  @ApiProperty({ example: 'John' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastName: string;

  @ApiProperty({ example: 'Acme Inc', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  company?: string;

  @ApiProperty({ example: '123 Main Street' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  address1: string;

  @ApiProperty({ example: 'Apt 4B', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address2?: string;

  @ApiProperty({ example: 'New York' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city: string;

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

  @ApiProperty({ example: 'US' })
  @IsString()
  @MinLength(2)
  @MaxLength(2)
  country: string;

  @ApiProperty({ example: '+1-555-123-4567' })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  phone: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiProperty({ example: 'SHIPPING', enum: ['SHIPPING', 'BILLING'], required: false })
  @IsOptional()
  @IsIn(['SHIPPING', 'BILLING'])
  type?: 'SHIPPING' | 'BILLING';
}