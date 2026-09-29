import { Controller, Get, Patch, Post, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AddressDto } from './dto/address.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@aurevo/shared/types';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@CurrentUser('sub') userId: string) {
    return this.usersService.findById(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  async updateProfile(@CurrentUser('sub') userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Patch('me/notification-preferences')
  @ApiOperation({ summary: 'Update notification preferences for the current user' })
  async updateNotificationPreferences(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.usersService.updateNotificationPreferences(userId, dto);
  }

  @Post('me/change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change current user password' })
  async changePassword(@CurrentUser('sub') userId: string, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(userId, dto);
  }

  @Get('me/addresses')
  @ApiOperation({ summary: 'Get user addresses' })
  async getAddresses(@CurrentUser('sub') userId: string) {
    return this.usersService.getAddresses(userId);
  }

  @Post('me/addresses')
  @ApiOperation({ summary: 'Create a new address' })
  async createAddress(@CurrentUser('sub') userId: string, @Body() dto: AddressDto) {
    return this.usersService.createAddress(userId, dto);
  }

  @Patch('me/addresses/:id')
  @ApiOperation({ summary: 'Update an address' })
  async updateAddress(@CurrentUser('sub') userId: string, @Param('id') addressId: string, @Body() dto: AddressDto) {
    return this.usersService.updateAddress(userId, addressId, dto);
  }

  @Delete('me/addresses/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an address' })
  async deleteAddress(@CurrentUser('sub') userId: string, @Param('id') addressId: string) {
    return this.usersService.deleteAddress(userId, addressId);
  }

  @Post('me/addresses/:id/default')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set address as default' })
  async setDefaultAddress(@CurrentUser('sub') userId: string, @Param('id') addressId: string) {
    return this.usersService.setDefaultAddress(userId, addressId);
  }

  @Get('me/wishlist')
  @ApiOperation({ summary: 'Get user wishlist' })
  async getWishlist(@CurrentUser('sub') userId: string) {
    return this.usersService.getWishlist(userId);
  }

  @Post('me/wishlist')
  @ApiOperation({ summary: 'Add item to wishlist' })
  async addToWishlist(
    @CurrentUser('sub') userId: string,
    @Body() body: { productId: string; variantId?: string },
  ) {
    return this.usersService.addToWishlist(userId, body.productId, body.variantId);
  }

  @Delete('me/wishlist')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove item from wishlist' })
  async removeFromWishlist(
    @CurrentUser('sub') userId: string,
    @Body() body: { productId: string; variantId?: string },
  ) {
    return this.usersService.removeFromWishlist(userId, body.productId, body.variantId);
  }

  @Get('me/orders')
  @ApiOperation({ summary: 'Get user orders' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  async getOrders(
    @CurrentUser('sub') userId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.usersService.getOrders(userId, Number(page), Number(limit));
  }

  @Get('me/orders/:id')
  @ApiOperation({ summary: 'Get order detail' })
  async getOrderDetail(@CurrentUser('sub') userId: string, @Param('id') orderId: string) {
    return this.usersService.getOrderDetail(userId, orderId);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get user by ID (Admin only)' })
  async getUserById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }
}
