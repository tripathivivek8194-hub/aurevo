import { Controller, Get, Patch, Post, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, OrderStatus } from '@aurevo/shared/types';

@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all orders (Admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'PAYMENT_PENDING', 'PAID', 'PROCESSING', 'FULFILLMENT', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED', 'FAILED', 'RETURNED'] })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String, example: 'createdAt' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], example: 'desc' })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: OrderStatus,
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('sortBy') sortBy = 'createdAt',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
  ) {
    return this.ordersService.findAll({
      page: Number(page),
      limit: Number(limit),
      status,
      userId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      sortBy,
      sortOrder,
    });
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get order statistics (Admin only)' })
  @ApiQuery({ name: 'userId', required: false, type: String })
  async getStats(@Query('userId') userId?: string) {
    return this.ordersService.getOrderStats(userId);
  }

  @Get('recent')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get recent orders (Admin only)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  async getRecent(@Query('limit') limit = 10) {
    return this.ordersService.getRecentOrders(Number(limit));
  }

  @Get('me/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current customer\'s order summary (counts, total spent, last order date)' })
  async getMyStats(@CurrentUser('sub') userId: string) {
    const stats = await this.ordersService.getOrderStats(userId);
    const lastOrder = await this.ordersService.findMine(userId, { page: 1, limit: 1, sortBy: 'createdAt', sortOrder: 'desc' });
    return {
      totalOrders: stats.totalOrders,
      totalSpent: stats.totalRevenue,
      byStatus: stats.byStatus,
      lastOrderAt: lastOrder.data[0]?.createdAt ?? null,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current customer\'s order history' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'PAYMENT_PENDING', 'PAID', 'PROCESSING', 'FULFILLMENT', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED', 'FAILED', 'RETURNED'] })
  @ApiQuery({ name: 'sortBy', required: false, type: String, example: 'createdAt' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], example: 'desc' })
  async findMine(
    @CurrentUser('sub') userId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: OrderStatus,
    @Query('sortBy') sortBy = 'createdAt',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
  ) {
    return this.ordersService.findMine(userId, {
      page: Number(page),
      limit: Number(limit),
      status,
      sortBy,
      sortOrder,
    });
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get order by ID (owner or admin)' })
  async findById(
    @Param('id') id: string,
    @CurrentUser('sub') userId?: string,
    @CurrentUser('role') role?: string,
  ) {
    return this.ordersService.findById(id, userId, role);
  }

  @Get('number/:orderNumber')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get order by order number (owner or admin)' })
  async findByOrderNumber(
    @Param('orderNumber') orderNumber: string,
    @CurrentUser('sub') userId?: string,
    @CurrentUser('role') role?: string,
  ) {
    return this.ordersService.findByOrderNumber(orderNumber, userId, role);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update order status (Admin only)' })
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto);
  }

  @Post(':id/cancel')
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel order (owner or admin)' })
  async cancelOrder(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string | undefined,
    @CurrentUser('role') role: string | undefined,
    @Body() body: { reason?: string },
  ) {
    return this.ordersService.cancelOrder(id, userId, role, body.reason);
  }

  @Post(':id/tracking')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add tracking information (Admin only)' })
  async addTracking(
    @Param('id') id: string,
    @Body() body: { carrier: string; trackingNumber: string; trackingUrl?: string },
  ) {
    return this.ordersService.addTracking(id, body);
  }

  @Post('shipments/:shipmentId/events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add tracking event (Admin only)' })
  async addTrackingEvent(
    @Param('shipmentId') shipmentId: string,
    @Body() body: { status: string; location?: string; description: string; source?: string },
  ) {
    return this.ordersService.addTrackingEvent(shipmentId, body);
  }
}