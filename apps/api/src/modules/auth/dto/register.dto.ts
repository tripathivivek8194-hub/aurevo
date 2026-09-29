import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform, type TransformFnParams } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Strip markup/script characters from free-text names (stored-XSS defense).
 * Script blocks (including their content) are removed outright; remaining tags
 * and stray angle brackets are dropped. A fast tag-stripper — sufficient for
 * names — not a general HTML sanitizer.
 */
const sanitizeName = ({ value }: TransformFnParams): string =>
  String(value ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .trim();

export class RegisterDto {
  @ApiProperty({ example: 'john@example.com' })
  @Transform(({ value }) => String(value ?? '').toLowerCase().trim())
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'SecurePass123!', minLength: 8 })
  // M1: 8-72 chars, at least one lowercase, uppercase, digit and special
  // character. Fully anchored so the quantifier bounds the whole string.
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s])[^\s]{8,72}$/,
    {
      message:
        'Password must be 8-72 characters and include an uppercase letter, a lowercase letter, a number, and a special character.',
    },
  )
  password: string;

  @ApiProperty({ example: 'John' })
  @Transform(sanitizeName)
  @IsString()
  @Length(1, 50)
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @Transform(sanitizeName)
  @IsString()
  @Length(1, 50)
  lastName: string;

  /**
   * Declared only so `forbidNonWhitelisted` accepts-and-ignores a smuggled
   * `role` instead of rejecting it. The value is NEVER read: AuthService derives
   * the role server-side (CUSTOMER unless the email equals ADMIN_EMAIL, which
   * grants ADMIN). Frontends should not send this field at all.
   */
  @ApiPropertyOptional({
    description: 'Ignored — roles are derived server-side; do not send.',
    deprecated: true,
  })
  @IsOptional()
  @IsString()
  role?: string;
}
