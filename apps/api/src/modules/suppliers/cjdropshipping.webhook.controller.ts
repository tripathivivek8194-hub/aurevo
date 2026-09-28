import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createHash } from 'crypto';
import { CJDropshippingService } from './cjdropshipping.service';

/**
 * CJdropshipping webhook receiver.
 *
 * This endpoint is publicly accessible (no JwtAuthGuard) because CJ's servers
 * must be able to call it. It is LOG-ONLY and deliberately does NOT forward
 * orders or mutate anything.
 *
 * SECURITY POSTURE (C3):
 *  - Signature verification is STUBBED — it always returns true until the
 *    official CJ signature mechanism is confirmed with a real webhook event.
 *    We do NOT fake verification: every log line below marks the event
 *    `verification=UNVERIFIED` and the response says so explicitly.
 *  - Each log entry carries a SHA-256 digest of the received body so the log is
 *    tamper-evident: a reviewer can recompute the digest from the stored payload
 *    to prove the logged event is what actually arrived.
 *  - Rate-limited: this endpoint is public and unauthenticated, so the throttle
 *    caps how fast an attacker can flood our (signed, auditable) logs.
 */
@ApiTags('CJdropshipping')
@ApiExcludeController() // don't show in Swagger until signature verification is confirmed
@Controller('webhooks/cjdropshipping')
export class CJDropshippingWebhookController {
  private readonly logger = new Logger(CJDropshippingWebhookController.name);

  constructor(private readonly cjService: CJDropshippingService) {}

  /**
   * Receive a CJdropshipping webhook event.
   *
   * LOG-ONLY: nothing here calls cjService or mutates an order. The order
   * pipeline will be wired only after full signature verification is confirmed.
   */
  @Post()
  @HttpCode(HttpStatus.OK) // always 200 to prevent CJ retries
  @Throttle({ default: { limit: 60, ttl: 60000 } }) // public, unauthenticated — cap log-flood DoS
  @ApiOperation({ summary: 'Receive CJdropshipping webhook (public — signature unverified)' })
  async handleWebhook(
    @Body() body: any,
    @Headers('cj-signature') signature: string | undefined,
    @Headers('cj-timestamp') timestamp: string | undefined,
  ) {
    // C3: bind this log entry to the exact payload that arrived (tamper-evident
    // logging). This is a body digest, NOT a CJ signature — CJ has not been
    // verified, so the event is logged as UNVERIFIED.
    const bodyDigest = createHash('sha256')
      .update(body ? JSON.stringify(body) : '')
      .digest('hex')
      .slice(0, 16);

    const event = body?.event ?? body?.type ?? 'unknown';
    const data = body?.data ?? body;

    this.logger.log(
      `CJ webhook received: event=${event}, verification=UNVERIFIED, ` +
        `signature=${signature ? 'present' : 'NONE'}, timestamp=${timestamp ?? 'NONE'}, ` +
        `bodyDigest=${bodyDigest}`,
    );

    // STUB: verify signature before processing
    // TODO: Replace with real CJ signature verification once confirmed
    // if (!this.verifyWebhookSignature(body, signature, timestamp)) {
    //   this.logger.warn('CJ webhook signature verification failed');
    //   return { success: false, error: 'Invalid signature' };
    // }

    // Log event for debugging; do NOT auto-forward orders yet
    if (event === 'order_status_change' || event === 'ORDER_STATUS_CHANGE') {
      this.logger.log(
        `CJ order event (UNVERIFIED): orderId=${data?.orderId ?? data?.order_id ?? 'UNKNOWN'}, ` +
          `status=${data?.status ?? data?.orderStatus ?? 'UNKNOWN'}, bodyDigest=${bodyDigest}`,
      );
    } else if (event === 'tracking_update' || event === 'TRACKING_UPDATE') {
      this.logger.log(
        `CJ tracking update (UNVERIFIED): orderId=${data?.orderId ?? data?.order_id ?? 'UNKNOWN'}, ` +
          `bodyDigest=${bodyDigest}`,
      );
    } else {
      this.logger.log(
        `CJ webhook event (UNVERIFIED, unhandled): ${JSON.stringify(data).slice(0, 500)} ` +
          `bodyDigest=${bodyDigest}`,
      );
    }

    // Always return 200 so CJ doesn't retry. The response states plainly that
    // the event was NOT verified — we never claim a signature we didn't check.
    return { success: true, verification: 'UNVERIFIED' };
  }

  /**
   * STUB: Always returns true until the official CJ signature mechanism is confirmed.
   *
   * When confirmed, implement:
   * 1. Sort webhook body keys
   * 2. Concatenate key=value pairs
   * 3. HMAC-SHA256 with appSecret (from encrypted stored config)
   * 4. Compare with provided signature
   *
   * Until then this controller logs every event as UNVERIFIED and never acts on
   * it — deliberately not faking a signature.
   */
  private verifyWebhookSignature(
    _body: any,
    _signature: string | undefined,
    _timestamp: string | undefined,
  ): boolean {
    // TODO: Implement real CJ signature verification
    return true;
  }
}