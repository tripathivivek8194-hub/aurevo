import { NotFoundException } from '@nestjs/common';
import { EmailController } from './email.controller';

describe('EmailController support requests', () => {
  function build() {
    const emailService = { sendSupportRequest: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const controller = new EmailController(emailService as any, prisma as any);
    return { controller, emailService, prisma };
  }

  it('stores a normalized support request before attempting email notification', async () => {
    const { controller, emailService, prisma } = build();

    await controller.contact({
      name: '  Customer Name  ',
      email: 'CUSTOMER@EXAMPLE.COM ',
      orderNumber: ' AUR-123 ',
      message: '  Please help with my delivery.  ',
    });

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(emailService.sendSupportRequest).toHaveBeenCalledWith({
      name: 'Customer Name',
      email: 'customer@example.com',
      orderNumber: 'AUR-123',
      message: 'Please help with my delivery.',
    });
    expect(prisma.$executeRaw.mock.invocationCallOrder[0])
      .toBeLessThan(emailService.sendSupportRequest.mock.invocationCallOrder[0]);
  });

  it('silently accepts honeypot submissions without storing or emailing them', async () => {
    const { controller, emailService, prisma } = build();

    await controller.contact({
      name: 'Bot Name',
      email: 'bot@example.com',
      message: 'This is automated spam.',
      website: 'https://spam.example',
    });

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(emailService.sendSupportRequest).not.toHaveBeenCalled();
  });

  it('returns the latest stored requests to administrators', async () => {
    const { controller, prisma } = build();
    prisma.$queryRaw.mockResolvedValue([{ id: 'request-1', status: 'OPEN' }]);

    await expect(controller.requests()).resolves.toEqual([{ id: 'request-1', status: 'OPEN' }]);
  });

  it('reports a missing request when resolving an unknown id', async () => {
    const { controller, prisma } = build();
    prisma.$executeRaw.mockResolvedValue(0);

    await expect(controller.resolve('missing')).rejects.toThrow(NotFoundException);
  });
});
