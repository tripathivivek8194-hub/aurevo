import { SupplierApiErrorCode } from '@aurevo/shared/types';

/**
 * A supplier API failure that is safe to surface to an admin client.
 *
 * The `code` lets the UI distinguish why an operation failed without ever
 * receiving an App Secret, access token, or raw request parameters. The full
 * underlying error is logged server-side only and never leaks into the
 * message returned to the client.
 */
export class SupplierApiError extends Error {
  readonly code: SupplierApiErrorCode;
  readonly status?: number;

  constructor(code: SupplierApiErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'SupplierApiError';
    this.code = code;
    this.status = status;
  }
}
