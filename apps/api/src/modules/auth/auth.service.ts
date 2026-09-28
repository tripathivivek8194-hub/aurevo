import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { UserRole } from '@aurevo/shared';
import { v4 as uuidv4 } from 'uuid';

/**
 * Burn-targets for timing-attack defense (B1). Every email-existence branch must
 * do the SAME amount of expensive work so an attacker cannot tell a registered
 * email from a ghost by observing response time.
 *  - `DUMMY_BCRYPT_HASH` is a real bcrypt hash (generated at import time with
 *    the same round 12 as user hashes) that login/register compare or hash
 *    against on behalf of accounts that do not exist.
 *  - `GHOST_USER_ID` is a lookup-safe placeholder id used to mint (and discard)
 *    the same 24h/1h token an existing account would get.
 */
const DUMMY_BCRYPT_HASH = bcrypt.hashSync('aurevo-burned-password-for-timing', 12);
const GHOST_USER_ID = '00000000-0000-4000-8000-000000000000';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async register(registerDto: RegisterDto) {
    // Defense-in-depth normalization (the DTO already lowercases/trims, but the
    // service must not trust a caller that constructs RegisterDto directly).
    const email = (registerDto.email ?? '').toLowerCase().trim();
    const password = registerDto.password;
    const firstName = registerDto.firstName;
    const lastName = registerDto.lastName;

    // B1: burn the bcrypt cost BEFORE the existence branch. A duplicate email
    // must cost the same as a fresh one, or a 409-vs-201 timing difference would
    // let an attacker enumerate registered addresses.
    const passwordHash = await bcrypt.hash(password, 12);

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      // The hash above was burned purely for timing parity — nothing was created.
      throw new ConflictException('Email already registered');
    }

    // Check if this is an admin email (supports comma-separated list, case-insensitive)
    const adminEmails = (this.configService.get<string>('ADMIN_EMAIL') || '')
      .toLowerCase()
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    const role = adminEmails.includes(email) ? UserRole.ADMIN : UserRole.CUSTOMER;

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        role,
        emailVerified: false,
      },
    });

    // C5: the verification token is minted for email delivery only — it is NEVER
    // returned in an HTTP response (an attacker who knows a user's id could
    // otherwise self-verify); the token reaches the account via the
    // transactional email, exactly like a password-reset link.
    const verificationToken = await this.generateVerificationToken(user.id);
    await this.emailService.sendVerificationEmail(email, verificationToken);

    this.logger.log(`Registration: ${email} (${role})`);

    return {
      user: this.sanitizeUser(user),
    };
  }

  async login(loginDto: LoginDto, response: any) {
    const { email, password } = loginDto;

    const user = await this.prisma.user.findUnique({ where: { email } });

    // B1: compare against a real bcrypt hash in BOTH cases — the user's own hash
    // for a real account, a static dummy hash for a ghost. A missing account now
    // costs the same bcrypt round as a wrong-password attempt on a real one, so
    // the two return in the same wall-clock time with the identical body.
    const isPasswordValid = await bcrypt.compare(
      password,
      user?.passwordHash ?? DUMMY_BCRYPT_HASH,
    );

    if (!user || !isPasswordValid) {
      // Identical message + timing for unknown email vs wrong password — no
      // account enumeration.
      throw new UnauthorizedException('Invalid credentials');
    }

    // B1: only a caller with a CORRECT password sees account state. Checking
    // `isActive` before the compare would leak which emails are real.
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Generate tokens
    const tokens = await this.generateTokens(user);

    // Set refresh token cookie
    this.setRefreshTokenCookie(response, tokens.refreshToken);

    // Update last login
    await (this.prisma as any).user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.log(`Login: ${email}`);

    return {
      user: this.sanitizeUser(user),
      accessToken: tokens.accessToken,
    };
  }

  async loginWithGoogle(idToken: string, response: any) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');

    if (!clientId) {
      throw new UnauthorizedException('Google sign-in is not configured');
    }

    if (!idToken || idToken.length < 10) {
      throw new UnauthorizedException('Invalid Google credential');
    }

    let payload: any;

    try {
      const googleClient = new OAuth2Client(clientId);

      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: clientId,
      });

      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google credential');
    }

    if (
      !payload?.sub ||
      !payload?.email ||
      payload.email_verified !== true
    ) {
      throw new UnauthorizedException('Google account could not be verified');
    }

    const googleId = payload.sub;
    const email = payload.email.toLowerCase().trim();

    // Look for an existing Google-linked account and an existing
    // email/password account.
    const googleUser = await this.prisma.user.findUnique({
      where: { googleId },
    });

    const emailUser = await this.prisma.user.findUnique({
      where: { email },
    });

    // A Google ID and email must never silently resolve to two
    // different AUREVO accounts.
    if (googleUser && emailUser && googleUser.id !== emailUser.id) {
      throw new UnauthorizedException(
        'This Google account cannot be linked to this email address',
      );
    }

    let user = googleUser || emailUser;

    if (user) {
      if (!user.isActive) {
        throw new UnauthorizedException('Account is deactivated');
      }

      // Existing AUREVO account: link Google to it.
      if (!user.googleId) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            googleId,
            emailVerified: true,
          },
        });
      } else if (user.googleId !== googleId) {
        throw new UnauthorizedException(
          'This email is already linked to another Google account',
        );
      } else if (!user.emailVerified) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { emailVerified: true },
        });
      }
    } else {
      // New Google account.
      //
      // Google users still receive a password hash because passwordHash
      // is currently required by the database. The generated password
      // is random and is never given to the user.
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, 12);

      const firstName =
        payload.given_name ||
        payload.name?.split(' ')[0] ||
        'Google';

      const lastName =
        payload.family_name ||
        payload.name?.split(' ').slice(1).join(' ') ||
        '';

      user = await this.prisma.user.create({
        data: {
          email,
          googleId,
          passwordHash,
          firstName,
          lastName,
          role: UserRole.CUSTOMER,
          emailVerified: true,
        },
      });

      this.logger.log(`Google account created: ${email}`);
    }

    // Use the exact same AUREVO session/token system as normal login.
    const tokens = await this.generateTokens(user);

    this.setRefreshTokenCookie(response, tokens.refreshToken);

    await (this.prisma as any).user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.log(`Google login: ${email}`);

    return {
      user: this.sanitizeUser(user),
      accessToken: tokens.accessToken,
    };
  }

  async refresh(refreshToken: string, response: any) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }

    // Verify refresh token
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Tokens minted before `jti`/`sub` were always set may lack them. Refuse
    // cleanly (401) instead of letting Prisma/Date crash with a 500 — a broken
    // refresh turns every subsequent admin API call into a 401 and logs the
    // user out with no path forward.
    if (!payload.jti || !payload.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check if refresh token is revoked
    const revokedToken = await (this.prisma as any).revokedToken.findUnique({
      where: { tokenId: payload.jti },
    });

    if (revokedToken) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    // Get user
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Revoke old refresh token (rotation). Guard both failure modes that used
    // to surface as a 500: (a) a token without an `exp` claim makes
    // `new Date(undefined * 1000)` throw RangeError, and (b) replaying an
    // already-rotated token hits the unique `tokenId` constraint. Both should
    // be a clean 401 → browser logs out and re-authenticates.
    const expiresAt = payload.exp
      ? new Date(payload.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    try {
      await (this.prisma as any).revokedToken.create({
        data: { tokenId: payload.jti, expiresAt },
      });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'P2002') {
        throw new UnauthorizedException('Refresh token already used');
      }
      throw err;
    }

    // Generate new tokens
    const tokens = await this.generateTokens(user);

    // Set new refresh token cookie
    this.setRefreshTokenCookie(response, tokens.refreshToken);

    return {
      user: this.sanitizeUser(user),
      accessToken: tokens.accessToken,
    };
  }

  async logout(refreshToken: string, response: any) {
    if (refreshToken) {
      try {
        const payload = this.jwtService.verify(refreshToken, {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        });
        if (payload?.jti) {
          const expiresAt = payload.exp
            ? new Date(payload.exp * 1000)
            : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          await (this.prisma as any).revokedToken.create({
            data: { tokenId: payload.jti, expiresAt },
          });
        }
      } catch {
        // Ignore invalid tokens
      }
    }

    // Clear refresh token cookie
    this.clearRefreshTokenCookie(response);

    return { success: true };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    const user = await this.prisma.user.findUnique({ where: { email } });

    // B1 + C5: mint the same 1h reset token whether or not the account exists,
    // and discard it for ghosts — the endpoint burns equivalent work and returns
    // a byte-identical `{ success: true }` body either way. The token is only ever
    // sent by email; it must NEVER appear in an HTTP response.
    const resetToken = await this.generateResetToken(user?.id ?? GHOST_USER_ID);

    // Only send the email for real accounts — ghosts get a burned token that is
    // never delivered, keeping the timing-attack defense intact.
    if (user) {
      await this.emailService.sendPasswordResetEmail(email, resetToken);
    }

    this.logger.log(`Password reset requested: ${email}`);

    return { success: true };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { token, password, confirmPassword } = resetPasswordDto;

    if (password !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    // Verify reset token
    let payload: any;
    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (payload.type !== 'password_reset') {
      throw new BadRequestException('Invalid token type');
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 12);

    // Update password and revoke all refresh tokens
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: payload.sub },
        data: { passwordHash },
      }),
      (this.prisma as any).revokedToken.createMany({
        data: (await this.prisma.refreshToken.findMany({ where: { userId: payload.sub } })).map(rt => ({
          tokenId: rt.tokenId,
          expiresAt: rt.expiresAt,
        })),
      }),
    ]);

    this.logger.log(`Password reset completed for user: ${payload.sub}`);

    return { success: true };
  }

  async verifyEmail(verifyEmailDto: VerifyEmailDto) {
    const { token } = verifyEmailDto;

    let payload: any;
    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new BadRequestException('Invalid or expired verification token');
    }

    if (payload.type !== 'email_verification') {
      throw new BadRequestException('Invalid token type');
    }

    const user = await this.prisma.user.update({
      where: { id: payload.sub },
      data: { emailVerified: true },
    });

    this.logger.log(`Email verified: ${user.email}`);

    return { success: true };
  }

  async resendVerificationEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // B1 + C5: identical work + identical body whether the email is unknown,
    // already verified, or unverified. The token is generated for email delivery
    // only and is never returned in the response.
    const verificationToken = await this.generateVerificationToken(user?.id ?? GHOST_USER_ID);

    // Only deliver to a real, unverified account — ghosts burn their token.
    if (user && !user.emailVerified) {
      await this.emailService.sendVerificationEmail(email, verificationToken);
    }

    this.logger.log(`Verification email resend requested: ${email}`);

    return { success: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return this.sanitizeUser(user);
  }

  private async generateTokens(user: any) {
    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwtService.sign(payload);

    // Refresh token carries a unique `jti` (jwt ID) so rotation and the
    // revocation denylist can key on it. Without it, the required `tokenId`
    // column could never be populated and login would fail.
    const jti = uuidv4();
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      jwtid: jti,
      // M2: refresh tokens are long-lived (30d) — never inherit the 15m access
      // default from the JwtModule options.
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRY') || '30d',
    });

    // M2: store only a SHA-256 digest of the refresh token, never the token
    // itself — a DB leak yields no usable session material. Rotation/replay
    // protection is keyed on `jti` (the denylist), not on storing raw tokens.
    const refreshPayload = this.jwtService.decode(refreshToken) as any;
    await (this.prisma as any).refreshToken.create({
      data: {
        token: this.hashToken(refreshToken),
        tokenId: jti,
        userId: user.id,
        expiresAt: new Date(refreshPayload.exp * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  private async generateVerificationToken(userId: string) {
    const payload = { sub: userId, type: 'email_verification' };
    return this.jwtService.sign(payload, { expiresIn: '24h' });
  }

  private async generateResetToken(userId: string) {
    const payload = { sub: userId, type: 'password_reset' };
    return this.jwtService.sign(payload, { expiresIn: '1h' });
  }

  /**
   * M2: the refresh cookie is HttpOnly, SameSite=Strict and scoped to the auth
   * routes (`/api/auth`) so it is never sent on unrelated navigation, and
   * `Secure` in production (over TLS). maxAge is set on write only — a
   * clearCookie must NOT carry maxAge, or Express would re-arm a 30-day cookie.
   */
  private setRefreshTokenCookie(response: any, token: string) {
    response.cookie('refresh_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/api/auth',
    });
  }

  private clearRefreshTokenCookie(response: any) {
    response.clearCookie('refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/api/auth',
    });
  }

  /** SHA-256 digest used for at-rest refresh tokens (never store the raw JWT). */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

    private sanitizeUser(user: any) {
    const { passwordHash, googleId, ...sanitized } = user;
    return sanitized;
  }
}