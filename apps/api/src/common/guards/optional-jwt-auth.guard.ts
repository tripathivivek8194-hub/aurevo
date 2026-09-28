import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Passport-jwt guard that authenticates when an Authorization Bearer token is
 * present, but allows the request through as anonymous otherwise. Used for
 * guest + logged-in cart/checkout routes where the controller resolves identity
 * as either the authenticated user (via CurrentUser('sub')) or a guest session
 * id (via ?sessionId=...).
 *
 * This mirrors JwtAuthGuard's passport strategy/secret but differs in the no-
 * token case: JwtAuthGuard checked @Public to allow anonymous; this guard
 * simply checks whether an Authorization header was sent.
 *
 * A present but invalid/expired token remains 401s (inherited handleRequest);
 * only the absence of a token is treated as anonymous.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Allow anonymous when no bearer token is presented.
    if (!request.headers?.authorization) {
      return true;
    }

    // Defer to passport-jwt (JwtStrategy.validate() will throw 401 on failure).
    return super.canActivate(context) as boolean | Promise<boolean>;
  }
}
