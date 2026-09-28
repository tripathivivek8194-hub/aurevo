import { IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Admin request to configure CJdropshipping. The credential is encrypted at
 * rest server-side and is never returned to the frontend.
 *
 * NOTE: current CJ API v2.0 authentication uses a SINGLE `apiKey` (obtained from
 * the CJ Apps section) — there is no app secret, and no appKey/email/password
 * OAuth flow. `getAccessToken` takes `{ apiKey }` and returns an access token
 * (plus refresh token), which are exchanged server-side and stored encrypted.
 */
export class ConfigureCJDropshippingDto {
  /** CJ API key (from the CJ Apps section). */
  @IsOptional()
  @IsString()
  @MinLength(8)
  apiKey?: string;
}
