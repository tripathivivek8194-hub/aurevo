import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { WishlistService } from './wishlist.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Wishlist')
@Controller('wishlist')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  @ApiOperation({ summary: 'Get user wishlist' })
  async getWishlist(@CurrentUser('sub') userId: string) {
    return this.wishlistService.getWishlist(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Add item to wishlist' })
  async addItem(
    @CurrentUser('sub') userId: string,
    @Body() body: { productId: string; variantId?: string },
  ) {
    return this.wishlistService.addItem(userId, body.productId, body.variantId);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove item from wishlist' })
  async removeItem(
    @CurrentUser('sub') userId: string,
    @Body() body: { productId: string; variantId?: string },
  ) {
    return this.wishlistService.removeItem(userId, body.productId, body.variantId);
  }

  @Delete('clear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear wishlist' })
  async clearWishlist(@CurrentUser('sub') userId: string) {
    return this.wishlistService.clearWishlist(userId);
  }

  @Get('check/:productId')
  @ApiOperation({ summary: 'Check if product is in wishlist' })
  @ApiQuery({ name: 'variantId', required: false, type: String })
  async checkInWishlist(
    @CurrentUser('sub') userId: string,
    @Param('productId') productId: string,
    @Query('variantId') variantId?: string,
  ) {
    const isInWishlist = await this.wishlistService.isInWishlist(userId, productId, variantId);
    return { inWishlist: isInWishlist };
  }
}