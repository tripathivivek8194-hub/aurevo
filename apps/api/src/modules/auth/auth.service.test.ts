import 'reflect-metadata';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { UserRole } from '@aurevo/shared';

/**
 * bcrypt is a native addon whose exports cannot be spyOn'd (non-configurable).
 * Wrap it in jest.fns that delegate to the real implementation — production
 * semantics are unchanged for every test, but the wrappers let the timing-
 * enumeration tests assert what work was actually performed (and override a
 * bcrypt result deterministically when the test needs a forced path).
 */
jest.mock('bcrypt', () => {
  const actual = jest.requireActual('bcrypt');
  return {
    __esModule: true,
    ...actual,
    hash: jest.fn((...args: unknown[]) => (actual.hash as (...a: unknown[]) => Promise<string>)(...args)),
    compare: jest.fn((...args: unknown[]) => (actual.compare as (...a: unknown[]) => Promise<boolean>)(...args)),
  };
});

/**
 * Security regression tests for the M1/M2 auth hardening: privilege escalation
 * is impossible (role is derived server-side from ADMIN_EMAIL), weak passwords
 * are rejected, email is normalized, names are XSS-sanitized, duplicate sign-ups
 * return a safe 409, and bcrypt uses round 12. Prisma/DI are mocked.
 */
describe('AuthService — registration security (M1/M2)', () => {
  function build(adminEmail = 'admin@aurevo.store') {
    const prisma: any = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      revokedToken: { findUnique: jest.fn(), create: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : arg)),
    };
    const usersService: any = {};
    const jwtService: any = {
      sign: jest.fn(() => 'signed.token'),
      decode: jest.fn(() => ({ exp: Math.floor(Date.now() / 1000) + 900 })),
      verify: jest.fn(),
    };
    const configService: any = {
      get: jest.fn((key: string) => (key === 'ADMIN_EMAIL' ? adminEmail : undefined)),
    };
    const emailService: any = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AuthService(prisma, usersService, jwtService, configService, emailService);
    return { service, prisma, jwtService, configService, emailService };
  }

  it('ignores a role field in the registration payload (privilege escalation)', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => ({ id: 'u1', ...data }));

    const result = await service.register({
      email: 'customer@example.com',
      password: 'Password123!',
      firstName: 'Jane',
      lastName: 'Doe',
      role: 'ADMIN',
    } as RegisterDto);

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: UserRole.CUSTOMER }),
      }),
    );
    expect(result.user.role).toBe(UserRole.CUSTOMER);
  });

  it('grants ADMIN only when the email equals the configured ADMIN_EMAIL (normalized)', async () => {
    const { service, prisma } = build('admin@aurevo.store');
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => ({ id: 'u1', ...data }));

    // Uppercase variant — the service must normalize before the role decision.
    await service.register({
      email: 'ADMIN@AUREVO.STORE',
      password: 'Password123!',
      firstName: 'Root',
      lastName: 'User',
    } as RegisterDto);

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: UserRole.ADMIN, email: 'admin@aurevo.store' }),
      }),
    );
  });

  it('grants ADMIN when email matches one of comma-separated ADMIN_EMAIL values (case-insensitive)', async () => {
    const { service, prisma } = build('admin@aurevo.buzz, owner@example.com');
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => ({ id: 'u1', ...data }));

    await service.register({
      email: 'ADMIN@aurevo.buzz',
      password: 'Password123!',
      firstName: 'Admin',
      lastName: 'User',
    } as RegisterDto);

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: UserRole.ADMIN, email: 'admin@aurevo.buzz' }),
      }),
    );
  });

  it('returns a safe 409 Conflict on duplicate email (no enumeration leak)', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      service.register({
        email: 'taken@example.com',
        password: 'Password123!',
        firstName: 'A',
        lastName: 'B',
      } as RegisterDto),
    ).rejects.toThrow(ConflictException);
  });

  it('hashes passwords with bcrypt round 12', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => ({ id: 'u1', ...data }));

    await service.register({
      email: 'hash@example.com',
      password: 'Password123!',
      firstName: 'A',
      lastName: 'B',
    } as RegisterDto);

    const created: any = prisma.user.create.mock.calls[0][0].data;
    expect(created.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it('never returns the password hash in a response (no credential leak)', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => ({
      id: 'u1',
      ...data,
      passwordHash: '$2b$12$hashhashhashhashhashhashha',
      emailVerified: false,
    }));

    const result = await service.register({
      email: 'clean@example.com',
      password: 'Password123!',
      firstName: 'A',
      lastName: 'B',
    } as RegisterDto);

    expect(result.user).not.toHaveProperty('passwordHash');
  });
});

describe('RegisterDto — input hardening (M1)', () => {
  function makeDto(raw: Record<string, unknown>) {
    return plainToInstance(RegisterDto, raw);
  }

  it('accepts a fully compliant payload', async () => {
    const dto = makeDto({
      email: 'jane@example.com',
      password: 'Password123!',
      firstName: 'Jane',
      lastName: 'Doe',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts (and ignores) an optional role field — whitelisted, not trusted', async () => {
    const dto = makeDto({
      email: 'jane@example.com',
      password: 'Password123!',
      firstName: 'Jane',
      lastName: 'Doe',
      role: 'ADMIN',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects unknown fields outright (forbidNonWhitelisted 400 source)', async () => {
    const dto = makeDto({
      email: 'jane@example.com',
      password: 'Password123!',
      firstName: 'Jane',
      lastName: 'Doe',
      isAdmin: true,
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.some((e) => e.property === 'isAdmin')).toBe(true);
  });

  it('rejects a weak password (no complexity)', async () => {
    const dto = makeDto({
      email: 'jane@example.com',
      password: 'weakpass',
      firstName: 'Jane',
      lastName: 'Doe',
    });
    expect((await validate(dto)).some((e) => e.property === 'password')).toBe(true);
  });

  it('rejects a password missing a special character', async () => {
    const dto = makeDto({
      email: 'jane@example.com',
      password: 'Password123',
      firstName: 'Jane',
      lastName: 'Doe',
    });
    expect((await validate(dto)).some((e) => e.property === 'password')).toBe(true);
  });

  it('rejects passwords over 72 characters', async () => {
    const dto = makeDto({
      email: 'jane@example.com',
      password: 'Password123!'.padEnd(80, 'a'),
      firstName: 'Jane',
      lastName: 'Doe',
    });
    expect((await validate(dto)).some((e) => e.property === 'password')).toBe(true);
  });

  it('rejects a non-email address', async () => {
    const dto = makeDto({
      email: 'not-an-email',
      password: 'Password123!',
      firstName: 'Jane',
      lastName: 'Doe',
    });
    expect((await validate(dto)).some((e) => e.property === 'email')).toBe(true);
  });

  it('lowercases and trims the email before validation', async () => {
    const dto = makeDto({
      email: '  JANE@Example.COM  ',
      password: 'Password123!',
      firstName: 'Jane',
      lastName: 'Doe',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.email).toBe('jane@example.com');
  });

  it('sanitizes script markup out of names (stored-XSS defense)', async () => {
    const dto = makeDto({
      email: 'jane@example.com',
      password: 'Password123!',
      firstName: '<script>alert(1)</script>Jane',
      lastName: 'Doe<img src=x onerror=alert(1)>',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.firstName).toBe('Jane');
    expect(dto.lastName).toBe('Doe');
  });
});

describe('AuthService — timing enumeration (B1/B2) & single-use tokens (C5)', () => {
  function build(adminEmail = 'admin@aurevo.store') {
    const prisma: any = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      revokedToken: { findUnique: jest.fn(), create: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : arg)),
    };
    const usersService: any = {};
    const jwtService: any = {
      sign: jest.fn(() => 'signed.token'),
      decode: jest.fn(() => ({ exp: Math.floor(Date.now() / 1000) + 900 })),
      verify: jest.fn(),
    };
    const configService: any = {
      get: jest.fn((key: string) => (key === 'ADMIN_EMAIL' ? adminEmail : undefined)),
    };
    const emailService: any = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AuthService(prisma, usersService, jwtService, configService, emailService);
    return { service, prisma, jwtService, configService, emailService };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register — timing burn + no token in the response', () => {
    it('burns bcrypt work even when the email is already taken (409 hashes too)', async () => {
      const { service, prisma } = build();
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register({
          email: 'taken@example.com',
          password: 'Password123!',
          firstName: 'A',
          lastName: 'B',
        } as RegisterDto),
      ).rejects.toThrow(ConflictException);

      // The expensive bcrypt step ran BEFORE the existence branch returned 409.
      expect(bcrypt.hash).toHaveBeenCalledTimes(1);
    });

    it('never returns a verificationToken in the response (C5)', async () => {
      const { service, prisma } = build();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(async ({ data }: any) => ({
        id: 'u1', ...data, emailVerified: false,
      }));

      const result = await service.register({
        email: 'clean@example.com',
        password: 'Password123!',
        firstName: 'A',
        lastName: 'B',
      } as RegisterDto);

      expect(result).toEqual(expect.objectContaining({ user: expect.any(Object) }));
      expect(result).not.toHaveProperty('verificationToken');
    });
  });

  describe('login — identical message + work for ghost vs wrong password', () => {
    const creds = { email: 'x@example.com', password: 'WrongPassword123!' };

    it('treats an unknown email exactly like a wrong password (same 401 body)', async () => {
      const { service, prisma } = build();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(creds, {})).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
      // The ghost still burned a full bcrypt.compare against the dummy hash.
      expect(bcrypt.compare).toHaveBeenCalledWith(
        creds.password,
        expect.stringMatching(/^\$2[aby]\$12\$/),
      );
    });

    it('returns the same message for a wrong password on a real account', async () => {
      const { service, prisma } = build();
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1', email: 'x@example.com', passwordHash: '$2b$12$userhashuserhashuserh', isActive: true,
      });

      await expect(service.login(creds, {})).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
    });

    it('checks isActive only AFTER the password validates (no pre-verify enumeration)', async () => {
      const { service, prisma } = build();
      // Deactivated account + WRONG password → generic "Invalid credentials",
      // never the deactivated message — proves isActive isn't a timing oracle.
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1', email: 'dead@example.com', passwordHash: '$2b$12$userhashuserhashuserh', isActive: false,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);
      await expect(service.login(creds, {})).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );

      // Deactivated account + CORRECT password → "Account is deactivated".
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
      await expect(service.login(creds, {})).rejects.toThrow(
        new UnauthorizedException('Account is deactivated'),
      );
    });

    it('keeps only admin sessions signed in for 180 days', async () => {
      const { service, prisma, jwtService } = build();
      const response = { cookie: jest.fn() };
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@aurevo.buzz',
        passwordHash: '$2b$12$userhashuserhashuserh',
        isActive: true,
        role: UserRole.ADMIN,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

      await service.login(
        { email: 'admin@aurevo.buzz', password: 'Password123!' },
        response,
      );

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.ADMIN }),
        expect.objectContaining({ expiresIn: '180d' }),
      );
      expect(response.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'signed.token',
        expect.objectContaining({
          httpOnly: true,
          maxAge: 180 * 24 * 60 * 60 * 1000,
          path: '/api/auth',
        }),
      );
    });

    it('uses a cross-site partitioned cookie for the deployed frontend and API', async () => {
      const previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const { service, prisma } = build();
        const response = { cookie: jest.fn() };
        prisma.user.findUnique.mockResolvedValue({
          id: 'admin-1',
          email: 'admin@aurevo.buzz',
          passwordHash: '$2b$12$userhashuserhashuserh',
          isActive: true,
          role: UserRole.ADMIN,
        });
        (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

        await service.login(
          { email: 'admin@aurevo.buzz', password: 'Password123!' },
          response,
        );

        expect(response.cookie).toHaveBeenCalledWith(
          'refresh_token',
          'signed.token',
          expect.objectContaining({
            secure: true,
            sameSite: 'none',
            partitioned: true,
          }),
        );
      } finally {
        process.env.NODE_ENV = previousNodeEnv;
      }
    });
  });

  describe('forgot-password / resend — identical body for ghosts, no token leaked (B1/C5)', () => {
    it('returns byte-identical { success:true } for existing vs ghost email', async () => {
      const { service, prisma } = build();

      prisma.user.findUnique.mockResolvedValue({
        id: 'u1', email: 'real@example.com', emailVerified: false,
      });
      const existingBody = await service.forgotPassword({ email: 'real@example.com' });

      prisma.user.findUnique.mockResolvedValue(null);
      const ghostBody = await service.forgotPassword({ email: 'ghost@example.com' });

      expect(existingBody).toEqual({ success: true });
      expect(ghostBody).toEqual({ success: true });
      // No resetToken is ever exposed in the response.
      expect(existingBody).not.toHaveProperty('resetToken');
    });

    it('burns the same 1h token-generation work for ghosts as for real accounts', async () => {
      const { service, prisma, jwtService } = build();
      prisma.user.findUnique.mockResolvedValue(null);

      await service.forgotPassword({ email: 'ghost@example.com' });
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'password_reset' }),
        expect.objectContaining({ expiresIn: '1h' }),
      );
    });

    it('returns { success:true } with no verificationToken from resend, even for a valid account', async () => {
      const { service, prisma, jwtService } = build();
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1', email: 'unver@example.com', emailVerified: false,
      });

      const body = await service.resendVerificationEmail('unver@example.com');
      expect(body).toEqual({ success: true });
      expect(body).not.toHaveProperty('verificationToken');
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'email_verification' }),
        expect.objectContaining({ expiresIn: '24h' }),
      );
    });
  });
});
