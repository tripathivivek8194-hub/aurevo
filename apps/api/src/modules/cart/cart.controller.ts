import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CartService } from './cart.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Cart')
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get cart (user or session)' })
  @ApiQuery({ name: 'sessionId', required: false, type: String })
  async getCart(
    @CurrentUser('sub') userId: string | undefined,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.cartService.getCart(userId, sessionId);
  }

  @Get('summary')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get cart summary (item count, subtotal)' })
  @ApiQuery({ name: 'sessionId', required: false, type: String })
  async getCartSummary(
    @CurrentUser('sub') userId: string | undefined,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.cartService.getCartSummary(userId, sessionId);
  }

  @Get('validate')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Validate cart for checkout' })
  @ApiQuery({ name: 'sessionId', required: false, type: String })
  async validateCart(
    @CurrentUser('sub') userId: string | undefined,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.cartService.validateCartForCheckout(userId, sessionId);
  }

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Add item to cart' })
  @ApiQuery({ name: 'sessionId', required: false, type: String })
  async addToCart(
    @CurrentUser('sub') userId: string | undefined,
    @Query('sessionId') sessionId: string | undefined,
    @Body() dto: AddToCartDto,
  ) {
    return this.cartService.addToCart(userId, sessionId, dto);
  }

  @Patch('items/:itemId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Update cart item quantity' })
  @ApiQuery({ name: 'sessionId', required: false, type: String })
  async updateCartItem(
    @CurrentUser('sub') userId: string | undefined,
    @Query('sessionId') sessionId: string | undefined,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    const cart = await this.cartService.getOrCreateCart(userId, sessionId);
    return this.cartService.updateCartItem(cart.id, itemId, dto);
  }

  @Delete('items/:itemId')
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove item from cart' })
  @ApiQuery({ name: 'sessionId', required: false, type: String })
  async removeCartItem(
    @CurrentUser('sub') userId: string | undefined,
    @Query('sessionId') sessionId: string | undefined,
    @Param('itemId') itemId: string,
  ) {
    const cart = await this.cartService.getOrCreateCart(userId, sessionId);
    return this.cartService.removeCartItem(cart.id, itemId);
  }

  @Delete()
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear cart' })
  @ApiQuery({ name: 'sessionId', required: false, type: String })
  async clearCart(
    @CurrentUser('sub') userId: string | undefined,
    @Query('sessionId') sessionId: string | undefined,
  ) {
    const cart = await this.cartService.getOrCreateCart(userId, sessionId);
    return this.cartService.clearCart(cart.id);
  }

  @Post('merge')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Merge session cart into user cart (after login)' })
  async mergeCarts(
    @CurrentUser('sub') userId: string,
    @Body() body: { sessionId: string },
  ) {
    return this.cartService.mergeCarts(userId, body.sessionId);
  }
}