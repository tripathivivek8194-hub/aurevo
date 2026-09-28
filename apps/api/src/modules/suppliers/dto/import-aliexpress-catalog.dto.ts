import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Admin request to import real AliExpress products from a featured promo feed
 * (`aliexpress.ds.recommend.feed.get`) into AUREVO's Product table.
 *
 * Every imported product is created DRAFT (never ACTIVE), assigned to the single
 * existing AUREVO `categoryId` chosen by the admin, and capped per run. Only
 * granted `aliexpress.ds.*` methods are used — never the denied affiliate paths.
 */
export class ImportAliExpressCatalogDto {
  /** Feed name, e.g. `AEB_BR_DropiSelectedItems_20241106` (from feeds list). */
  @IsString()
  @IsNotEmpty()
  feedName: string;

  /** Feed region, e.g. `BR` — must match the feed's own country. */
  @IsString()
  @IsNotEmpty()
  country: string;

  /** Existing AUREVO category every imported product is assigned to. */
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  pageSize?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  /** Target currency AliExpress converts prices to (also stored on the Product). Defaults to INR (the store currency). */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter code, e.g. INR' })
  currency?: string;

  /** When true, backfills variants/SKUs from `aliexpress.ds.product.get` (per-product). */
  @IsOptional()
  @IsBoolean()
  enrich?: boolean;

  /** Dedup behavior for existing products. `'update'` refreshes feed fields (price, images, metadata)
   *  while preserving admin-owned name/category/status. `'skip'` leaves existing products untouched.
   *  Defaults to `'skip'` in the legacy wrapper to preserve idempotent re-run test expectations. */
  @IsOptional()
  @IsIn(['update', 'skip'])
  mode?: 'update' | 'skip';
}

/** Query DTO for a single live feed page preview (safe fields only). */
export class PreviewAliExpressCatalogQueryDto {
  @IsString()
  @IsNotEmpty()
  feedName: string;

  @IsString()
  @IsNotEmpty()
  country: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter code, e.g. INR' })
  currency?: string;
}

// ---------------------------------------------------------------------
// Job-based import DTOs (resumable, page-by-page)
// ---------------------------------------------------------------------

/** Request body for `POST catalog/jobs`. Creates a new resumable import job. */
export class CreateImportJobDto {
  /** Feed name, e.g. `AEB_BR_DropiSelectedItems_20241106` (from feeds list). */
  @IsString()
  @IsNotEmpty()
  feedName: string;

  /** Feed region, e.g. `BR` — must match the feed's own country. */
  @IsString()
  @IsNotEmpty()
  country: string;

  /** Existing AUREVO category every imported product is assigned to. */
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  /** Max products fetched per advance call (AliExpress page size). Default 25, max 50. */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  perRunLimit?: number;

  /** Target currency for price conversion. Defaults to INR (the store currency). */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter code, e.g. INR' })
  currency?: string;

  /** When true, backfills variants/SKUs from `aliexpress.ds.product.get` (per-product). */
  @IsOptional()
  @IsBoolean()
  enrich?: boolean;

  /** Dedup behavior: `'update'` refreshes feed fields; `'skip'` leaves existing products untouched. Default `'update'`. */
  @IsOptional()
  @IsIn(['update', 'skip'])
  mode?: 'update' | 'skip';
}

/** Route param DTO for single-job endpoints (`:id`). */
export class JobIdParamDto {
  @IsString()
  @IsNotEmpty()
  id: string;
}