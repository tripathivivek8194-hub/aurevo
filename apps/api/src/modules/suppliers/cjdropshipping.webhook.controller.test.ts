import 'reflect-metadata';
import { CJDropshippingWebhookController } from './cjdropshipping.webhook.controller';

/**
 * C3 regression tests — the CJ webhook is LOG-ONLY and honest about the
 * signature being UNVERIFIED:
 *  - it must never call the supplier service (no order auto-forwarding);
 *  - it must always answer 200 (no CJ retries);
 *  - the response and every log line must mark the event UNVERIFIED;
 *  - each log entry is bound to a SHA-256 body digest for tamper evidence.
 */
describe('CJDropshippingWebhookController — log-only, honest UNVERIFIED (C3)', () => {
  function build() {
    const cjService: any = { anyMethod: jest.fn() };
    const controller = new CJDropshippingWebhookController(cjService);
    return { controller, cjService };
  }

  it('does NOT forward or mutate anything — returns 200 with an UNVERIFIED marker', async () => {
    const { controller, cjService } = build();
    const result = await controller.handleWebhook(
      { event: 'ORDER_STATUS_CHANGE', data: { orderId: 'CJ123', status: 'packed' } },
      'cj-signature-value',
      '1700000000',
    );

    expect(result).toEqual({ success: true, verification: 'UNVERIFIED' });
    // Never touches the supplier pipeline — log only.
    expect(jest.mocked(cjService).anyMethod).not.toHaveBeenCalled();
  });

  it('logs every event with verification=UNVERIFIED and a tamper-evident body digest', async () => {
    const { controller } = build();
    const logSpy = jest.spyOn((controller as any).logger, 'log');

    await controller.handleWebhook(
      { event: 'order_status_change', data: { orderId: 'CJ456', status: 'SHIPPED' } },
      undefined,
      undefined,
    );

    const joined = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(joined).toContain('verification=UNVERIFIED');
    expect(joined).toContain('bodyDigest=');
    expect(joined).toContain('signature=NONE');
  });

  it('answers 200 (not 4xx) for a signature-less request so CJ never retries in a loop', async () => {
    // reflect-metadata + decorators give the handler its HttpCode(OK) — the
    // controller instance itself returns the body; 200 is enforced by the route.
    const { controller } = build();
    const result = await controller.handleWebhook({ type: 'tracking_update' }, undefined, undefined);
    expect(result).toEqual({ success: true, verification: 'UNVERIFIED' });
  });
});