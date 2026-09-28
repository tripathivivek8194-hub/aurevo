import {
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
 * CJdropshipping is search/list based — there is no full-catalog feed. Imports
 * are driven by a controlled search source (keyword or CJ category) rather than
 * pretending the whole CJ catalog is downloaded.
 */

/** Search/browse a page of the CJ catalog for the admin to preview/select. */
export class SearchCJDto {
  /** Keyword to search the CJ catalog. */
  @IsOptional()
  @IsString()
  query?: string;

  /** Optional CJ category id filter. */
  @IsOptional()
  @IsString()
  cjCategoryId?: string;

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

  /** Currency used for the admin preview. CJ supplier costs are normally USD. */
  @IsOptional()
  @IsIn(['INR', 'USD'])
  currency?: 'INR' | 'USD';
}

/** Request body for `POST jobs`. Creates a resumable import job over a CJ search. */
export class CreateCJImportJobDto {
  /** Search source that drives the import (keyword or CJ category name). Used as
   *  the resume identity, so it must be stable for a given run. */
  @IsString()
  @IsNotEmpty()
  source: string;

  /** Existing AUREVO category every imported product is assigned to. */
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  /** Max products fetched per advance call (page size). Default 25, max 50. */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  perRunLimit?: number;

  /** Currency stored on imported products. Defaults to INR (the store currency). */
  @IsOptional()
  @IsString()
  @IsIn(['INR', 'USD'])
  currency?: string;

  /** Dedup behavior: `'update'` refreshes feed fields; `'skip'` leaves existing
   *  products untouched. Default `'update'`. */
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
