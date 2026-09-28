import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailService, OrderEmailData } from './email.service';

describe('EmailService', () => {
  let service: EmailService;
  let fetchSpy: jest.SpyInstance;

  beforeAll(() => {
    process.env.EMAIL_API_KEY = 're_test_key';
    process.env.EMAIL_FROM = 'test@aurevo.store';
    process.env.EMAIL_FROM_NAME = 'AUREVO Test';
    process.env.WEB_URL = 'https://aurevo.store';
    process.env.ADMIN_EMAIL = 'support@aurevo.store';
  });

  beforeEach(async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'msg_123' }), { status: 200 }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailService],
    }).compile();

    service = module.get(EmailService);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  afterAll(() => {
    delete process.env.EMAIL_API_KEY;
    delete process.env.EMAIL_FROM;
    delete process.env.EMAIL_FROM_NAME;
    delete process.env.WEB_URL;
    delete process.env.ADMIN_EMAIL;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendVerificationEmail', () => {
    it('sends email with verification link', async () => {
      await service.sendVerificationEmail('user@test.com', 'tok_abc123');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://api.resend.com/emails');

      const body = JSON.parse(opts.body);
      expect(body.to).toEqual(['user@test.com']);
      expect(body.subject).toContain('Verify');
      expect(body.html).toContain('https://aurevo.store/verify-email?token=tok_abc123');
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('sends email with reset link', async () => {
      await service.sendPasswordResetEmail('user@test.com', 'rst_xyz789');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.to).toEqual(['user@test.com']);
      expect(body.subject).toContain('Reset');
      expect(body.html).toContain('https://aurevo.store/reset-password?token=rst_xyz789');
    });
  });

  describe('sendOrderConfirmation', () => {
    it('sends email with order details', async () => {
      const order: OrderEmailData = {
        orderNumber: 'AUR1234567890',
        total: 299900,
        currency: 'INR',
        items: [
          { productName: 'Classic Oxford Shirt', quantity: 1, unitPrice: 149900 },
          { productName: 'Canvas Tote Bag', quantity: 2, unitPrice: 99900 },
        ],
      };

      await service.sendOrderConfirmation('buyer@test.com', order);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.to).toEqual(['buyer@test.com']);
      expect(body.subject).toContain('AUR1234567890');
      expect(body.html).toContain('Classic Oxford Shirt');
      expect(body.html).toContain('Canvas Tote Bag');
      expect(body.html).toContain('2999.00');
    });
  });

  describe('sendSupportRequest', () => {
    it('sends an escaped request to support with reply-to set', async () => {
      await service.sendSupportRequest({
        name: '<Customer>',
        email: 'customer@example.com',
        orderNumber: 'AUR-123',
        message: '<script>alert(1)</script>\nPlease help',
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.to).toEqual(['support@aurevo.store']);
      expect(body.reply_to).toBe('customer@example.com');
      expect(body.subject).toContain('AUR-123');
      expect(body.html).not.toContain('<script>');
      expect(body.html).toContain('&lt;script&gt;');
    });
  });

  describe('when EMAIL_API_KEY is missing', () => {
    it('logs but does not throw', async () => {
      // Create a fresh instance with no key
      const original = process.env.EMAIL_API_KEY;
      delete process.env.EMAIL_API_KEY;

      const mod = await Test.createTestingModule({
        providers: [EmailService],
      }).compile();
      const noKeyService = mod.get(EmailService);

      const logSpy = jest.spyOn(Logger.prototype, 'log');
      await noKeyService.sendVerificationEmail('x@y.com', 'tok');
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[EMAIL-NOOP]'));
      logSpy.mockRestore();

      // Restore
      if (original) process.env.EMAIL_API_KEY = original;
    });
  });
});
