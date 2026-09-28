import { Controller, Get, Post, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CheckoutService } from './checkout.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Get('preview')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Preview order totals before placing' })
  @ApiQuery({ name: 'sessionId', required: false, type: String })
  @ApiQuery({ name: 'shippingMethodId', required: false, type: String })
  async previewOrder(
    @CurrentUser('sub') userId: string | undefined,
    @Query('sessionId') sessionId: string | undefined,
    @Query('shippingMethodId') shippingMethodId?: string,
  ) {
    return this.checkoutService.previewOrder(userId, sessionId, shippingMethodId);
  }

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // cap order placement per IP (spam/abuse ceiling)
  @ApiOperation({ summary: 'Create order from cart' })
  @ApiQuery({ name: 'sessionId', required: false, type: String })
  async createOrder(
    @CurrentUser('sub') userId: string | undefined,
    @Query('sessionId') sessionId: string | undefined,
    @Body() dto: CreateOrderDto,
  ) {
    return this.checkoutService.createOrder(userId, sessionId, dto);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiQuery({ name: 'sessionId', required: false, type: String })
  async getOrderById(
    @Param('id') orderId: string,
    @CurrentUser('sub') userId: string | undefined,
    @Query('sessionId') sessionId: string | undefined,
  ) {
    return this.checkoutService.getOrderById(orderId, userId, sessionId);
  }

  @Get('number/:orderNumber')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get order by order number' })
  @ApiQuery({ name: 'sessionId', required: false, type: String })
  async getOrderByNumber(
    @Param('orderNumber') orderNumber: string,
    @CurrentUser('sub') userId: string | undefined,
    @Query('sessionId') sessionId: string | undefined,
  ) {
    return this.checkoutService.getOrderByNumber(orderNumber, userId, sessionId);
  }
}