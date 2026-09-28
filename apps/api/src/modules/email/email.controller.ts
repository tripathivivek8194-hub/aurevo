import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { randomUUID } from 'crypto';
import { UserRole } from '@aurevo/shared';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaService } from '../../database/prisma.service';
import { EmailService } from './email.service';

class ContactSupportDto {
  @IsString()
  @Length(2, 80)
  name!: string;

  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  orderNumber?: string;

  @IsString()
  @Length(10, 2000)
  message!: string;

  // Honeypot: real customers never see or fill this field.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}

@Controller('support')
export class EmailController {
  constructor(
    private readonly emailService: EmailService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('contact')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async contact(@Body() body: ContactSupportDto) {
    if (!body.website) {
      const request = {
        name: body.name.trim(),
        email: body.email.trim().toLowerCase(),
        orderNumber: body.orderNumber?.trim() || undefined,
        message: body.message.trim(),
      };
      const id = randomUUID();
      await this.prisma.$executeRaw`
        INSERT INTO "support_requests" ("id", "name", "email", "orderNumber", "message", "status", "createdAt", "updatedAt")
        VALUES (${id}, ${request.name}, ${request.email}, ${request.orderNumber ?? null}, ${request.message}, 'OPEN', NOW(), NOW())
      `;
      await this.emailService.sendSupportRequest(request);
    }
    return { accepted: true, message: 'Your support request has been received.' };
  }

  @Get('requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async requests() {
    return this.prisma.$queryRaw<Array<{
      id: string;
      name: string;
      email: string;
      orderNumber: string | null;
      message: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    }>>`
      SELECT "id", "name", "email", "orderNumber", "message", "status", "createdAt", "updatedAt"
      FROM "support_requests"
      ORDER BY "createdAt" DESC
      LIMIT 100
    `;
  }

  @Patch('requests/:id/resolve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async resolve(@Param('id') id: string) {
    const updated = await this.prisma.$executeRaw`
      UPDATE "support_requests"
      SET "status" = 'RESOLVED', "updatedAt" = NOW()
      WHERE "id" = ${id}
    `;
    if (updated === 0) throw new NotFoundException('Support request not found');
    return { id, status: 'RESOLVED' };
  }
}
