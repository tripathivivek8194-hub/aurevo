import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Admin runtime configuration for the AliExpress connection (Phase 8 follow-up).
 *
 * All fields are optional so the admin can update any subset without
 * resubmitting secrets they don't want to change. The App Secret is validated,
 * encrypted at rest by `SuppliersService.saveAliExpressConfig`, and is NEVER
 * returned to the frontend — see `AliExpressService.configure()`.
 *
 * Deep validation (placeholder rejection, HTTPS + exact callback path) happens
 * in `AliExpressService.configure()` so error messages stay controlled and
 * credentials are never included in them.
 */
export class ConfigureAliExpressDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  appKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  appSecret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  callbackUrl?: string;
}
