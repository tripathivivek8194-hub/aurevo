import { Controller, Get, Post, Body, Param, Query, UseGuards, HttpCode, HttpStatus, Headers, Req, RawBodyRequest, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { CreatePaymentOrderDto } from './dto/create-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@aurevo/shared/types';
import { Request } from 'express';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-order')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Create Razorpay order for payment' })
  @ApiQuery({ name: 'sessionId', required: false, type: String })
  async createOrder(
    @CurrentUser('sub') userId: string | undefined,
    @Query('sessionId') sessionId: string | undefined,
    @Body() dto: CreatePaymentOrderDto,
  ) {
    // Ownership + payable-state gating live in PaymentsService.createOrderPayment.
    return this.paymentsService.createOrderPayment(dto.orderId, userId, sessionId);
  }

  @Post('verify')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Verify a Razorpay Checkout payment (client handler)' })
  @ApiQuery({ name: 'sessionId', required: false, type: String })
  async verifyPayment(
    @CurrentUser('sub') userId: string | undefined,
    @Query('sessionId') sessionId: string | undefined,
    @Body() dto: VerifyPaymentDto,
  ) {
    return this.paymentsService.verifyClientPayment(dto, userId, sessionId);
  }

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Razorpay webhook handler' })
  @ApiHeader({ name: 'x-razorpay-signature', required: true })
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    // Verify the HMAC over the raw body bytes Razorpay actually sent, then parse.
    const raw = Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : '';
    const payload = raw ? JSON.parse(raw) : req.body;
    const result = await this.paymentsService.verifyPaymentWebhook(payload, raw, signature);

    // A1/A3: a signature-valid webhook that fails billing integrity (amount /
    // currency mismatch, or an illegal order-state transition) is REJECTED with
    // a 400 and `{ verified: false }` — Razorpay is told the event was bad, and
    // the order is never marked PAID.
    if (result.verified === false && result.reason) {
      throw new BadRequestException(`Webhook rejected: ${result.reason}`);
    }

    return result;
  }

  @Get('admin/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payment statistics (Admin only)' })
  async getStats() {
    return this.paymentsService.getPaymentStats();
  }

  @Get('order/:orderId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payment by order ID' })
  async getPaymentByOrderId(@Param('orderId') orderId: string, @CurrentUser('sub') userId: string) {
    const order = await this.paymentsService['prisma'].order.findUnique({
      where: { id: orderId },
    });

    if (!order || (order.userId !== userId)) {
      throw new ForbiddenException('Not authorized');
    }

    return this.paymentsService.getPaymentByOrderId(orderId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payment by ID' })
  async getPaymentById(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    const payment = await this.paymentsService.getPaymentById(id);

    // Check ownership (unless admin)
    if (payment.order.userId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    return payment;
  }

  @Post(':id/refund')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refund payment (Admin only)' })
  async refundPayment(
    @Param('id') id: string,
    @Body() dto: RefundPaymentDto,
  ) {
    return this.paymentsService.refundPayment(id, dto.amount, dto.reason);
  }
}