import { IsString, IsEmail, IsOptional, ValidateNested, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AddressInputDto {
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
}

export class CreateOrderDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ type: AddressInputDto })
  @ValidateNested()
  @Type(() => AddressInputDto)
  shippingAddress: AddressInputDto;

  @ApiProperty({ type: AddressInputDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressInputDto)
  billingAddress?: AddressInputDto;

  @ApiProperty({ example: 'clx123...', required: false, description: 'Shipping method id (Prisma cuid)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  shippingMethodId?: string;

  @ApiProperty({ example: 'Please leave at door', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ example: 'COUPON123', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  couponCode?: string;
}