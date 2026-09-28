import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';

/**
 * Global HTTP rate-limit guard with route-aware 429 messages.
 *
 * Keeps the stock ThrottlerGuard storage/counter/release semantics; only the
 * limit-exceeded response is customized, keyed by the controller handler being
 * throttled. Per-route windows are declared with `@Throttle(...)` at the handler
 * (e.g. registration: max 3/hour/IP).
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async throwThrottlingException(
    context: ExecutionContext,
    _throttlerLimitDetail?: unknown,
  ): Promise<void> {
    const handlerName = context.getHandler().name ?? '';
    switch (handlerName) {
      case 'register':
        throw new ThrottlerException(
          'Too many accounts created from this IP. Please try again in an hour.',
        );
      case 'login':
        throw new ThrottlerException(
          'Too many login attempts from this IP. Please try again later.',
        );
      case 'forgotPassword':
      case 'resendVerification':
        throw new ThrottlerException(
          'Too many requests from this IP. Please try again later.',
        );
      default:
        throw new ThrottlerException('Too many requests. Please try again later.');
    }
  }
}