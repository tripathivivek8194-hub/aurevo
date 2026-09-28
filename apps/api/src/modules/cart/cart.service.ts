import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { ProductsService } from '../products/products.service';

/** RFC 4122 UUID — guest carts are keyed by a random UUID from the client
 *  (see apps/web `lib/session.ts`), never by an arbitrary string. Enforcing the
 *  format stops an attacker from probing/crafting arbitrary session identities. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidSessionId(sessionId: string): boolean {
  return UUID_REGEX.test(sessionId);
}

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
  ) {}

  async getOrCreateCart(userId?: string, sessionId?: string) {
    if (!userId && !sessionId) {
      throw new BadRequestException('Either userId or sessionId is required');
    }

    // M4: an authenticated caller ALWAYS uses only their own userId — a
    // sessionId supplied in the query is ignored (never mixed in). Guest carts
    // require a well-formed UUID so arbitrary/guessed session strings can't be
    // used to reach another visitor's cart.
    if (!userId && !isValidSessionId(sessionId)) {
      throw new BadRequestException('Invalid session identifier');
    }

    // Atomic upsert on the unique key (userId OR sessionId). This eliminates
    // the findFirst→create race that caused P2002 under concurrent requests:
    // Prisma's upsert issues a single INSERT … ON CONFLICT DO UPDATE that is
    // atomic at the database level — no two requests can both miss and both
    // create, so no P2002 is ever possible by construction.
    const where = userId ? { userId } : { sessionId };

    return this.prisma.cart.upsert({
      where,
      update: {},
      create: { userId, sessionId },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: { where: { isPrimary: true }, take: 1 },
                variants: { where: { isActive: true } },
                inventory: true,
              },
            },
            variant: {
              include: { inventory: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async getCart(userId?: string, sessionId?: string) {
    return this.getOrCreateCart(userId, sessionId);
  }

  async addToCart(userId: string | undefined, sessionId: string | undefined, dto: AddToCartDto) {
    const cart = await this.getOrCreateCart(userId, sessionId);

    // Verify product exists and is active
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: { variants: { where: { isActive: true } }, inventory: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.status !== 'ACTIVE') {
      throw new ConflictException('Product is not available for purchase');
    }

    // Verify variant if provided
    let variant = null;
    if (dto.variantId) {
      variant = await this.prisma.productVariant.findFirst({
        where: { id: dto.variantId, productId: dto.productId, isActive: true },
        include: { inventory: true },
      });
      if (!variant) {
        throw new NotFoundException('Variant not found or not active');
      }
    }

    // Check inventory
    const inventory = variant?.inventory ?? product.inventory?.[0];
    if (inventory && inventory.trackQuantity) {
      const available = inventory.quantity - inventory.reservedQuantity;
      if (available < dto.quantity) {
        throw new ConflictException(`Only ${available} items available`);
      }
      if (!inventory.allowBackorder && available <= 0) {
        throw new ConflictException('Product is out of stock');
      }
    }

    // Check if item already in cart
    const existingItem = await this.prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId: dto.productId,
        variantId: dto.variantId ?? null,
      },
    });

    const price = variant?.price ?? product.basePrice;
    const compareAtPrice = variant?.compareAtPrice ?? product.compareAtPrice;

    if (existingItem) {
      const newQuantity = existingItem.quantity + dto.quantity;

      // Re-check inventory for new total
      if (inventory && inventory.trackQuantity) {
        const available = inventory.quantity - inventory.reservedQuantity;
        if (available < newQuantity) {
          throw new ConflictException(`Only ${available} items available`);
        }
      }

      return this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: newQuantity,
          priceSnapshot: price,
        },
        include: {
          product: { include: { images: { where: { isPrimary: true }, take: 1 } } },
          variant: true,
        },
      });
    }

    return this.prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId: dto.productId,
        variantId: dto.variantId,
        quantity: dto.quantity,
        priceSnapshot: price,
      },
      include: {
        product: { include: { images: { where: { isPrimary: true }, take: 1 } } },
        variant: true,
      },
    });
  }

  async updateCartItem(cartId: string, itemId: string, dto: UpdateCartItemDto) {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId },
      include: {
        product: { include: { inventory: true, variants: { include: { inventory: true } } } },
        variant: { include: { inventory: true } },
      },
    });

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    if (dto.quantity <= 0) {
      await this.prisma.cartItem.delete({ where: { id: itemId } });
      return { message: 'Item removed from cart' };
    }

    // Check inventory
    const inventory = item.variant?.inventory ?? item.product.inventory?.[0];
    if (inventory && inventory.trackQuantity) {
      const available = inventory.quantity - inventory.reservedQuantity;
      if (available < dto.quantity) {
        throw new ConflictException(`Only ${available} items available`);
      }
      if (!inventory.allowBackorder && available <= 0) {
        throw new ConflictException('Product is out of stock');
      }
    }

    return this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity: dto.quantity },
      include: {
        product: { include: { images: { where: { isPrimary: true }, take: 1 } } },
        variant: true,
      },
    });
  }

  async removeCartItem(cartId: string, itemId: string) {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId },
    });

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    await this.prisma.cartItem.delete({ where: { id: itemId } });
    return { message: 'Item removed from cart' };
  }

  async clearCart(cartId: string) {
    await this.prisma.cartItem.deleteMany({ where: { cartId } });
    return { message: 'Cart cleared' };
  }

  async mergeCarts(userId: string, sessionId: string) {
    // M4: the merge target must be a well-formed UUID too — prevents a caller
    // from passing an arbitrary session identity to absorb another guest cart.
    if (!isValidSessionId(sessionId)) {
      throw new BadRequestException('Invalid session identifier');
    }

    const sessionCart = await this.prisma.cart.findFirst({
      where: { sessionId },
      include: { items: true },
    });

    if (!sessionCart || sessionCart.items.length === 0) {
      return this.getOrCreateCart(userId);
    }

    const userCart = await this.getOrCreateCart(userId);

    for (const sessionItem of sessionCart.items) {
      const existingItem = await this.prisma.cartItem.findFirst({
        where: {
          cartId: userCart.id,
          productId: sessionItem.productId,
          variantId: sessionItem.variantId,
        },
      });

      if (existingItem) {
        await this.prisma.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity: existingItem.quantity + sessionItem.quantity },
        });
      } else {
        await this.prisma.cartItem.create({
          data: {
            cartId: userCart.id,
            productId: sessionItem.productId,
            variantId: sessionItem.variantId,
            quantity: sessionItem.quantity,
            priceSnapshot: sessionItem.priceSnapshot,
          },
        });
      }
    }

    // Delete session cart
    await this.prisma.cart.delete({ where: { id: sessionCart.id } });

    return this.getOrCreateCart(userId);
  }

  async validateCartForCheckout(userId?: string, sessionId?: string) {
    const cart = await this.getOrCreateCart(userId, sessionId);

    const issues: string[] = [];

    for (const item of cart.items) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
        include: { variants: { where: { isActive: true }, include: { inventory: true } }, inventory: true },
      });

      if (!product) {
        issues.push(`Product "${item.product.name}" no longer exists`);
        continue;
      }

      if (product.status !== 'ACTIVE') {
        issues.push(`Product "${product.name}" is no longer available`);
        continue;
      }

      const variant = item.variantId
        ? product.variants.find(v => v.id === item.variantId)
        : null;

      if (item.variantId && !variant) {
        issues.push(`Variant for "${product.name}" no longer exists`);
        continue;
      }

      const inventory = variant?.inventory ?? product.inventory?.[0];
      if (inventory && inventory.trackQuantity) {
        const available = inventory.quantity - inventory.reservedQuantity;
        if (available < item.quantity) {
          issues.push(`Only ${available} of "${product.name}" available (requested: ${item.quantity})`);
        }
        if (!inventory.allowBackorder && available <= 0) {
          issues.push(`"${product.name}" is out of stock`);
        }
      }

      // Check price changes
      const currentPrice = variant?.price ?? product.basePrice;
      if (currentPrice !== item.priceSnapshot) {
        issues.push(`Price for "${product.name}" has changed from ${item.priceSnapshot} to ${currentPrice}`);
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
      cart,
    };
  }

  async getCartSummary(userId?: string, sessionId?: string) {
    const cart = await this.getOrCreateCart(userId, sessionId);

    const subtotal = cart.items.reduce((sum, item) => sum + item.priceSnapshot * item.quantity, 0);
    const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

    return {
      itemCount,
      subtotal,
      items: cart.items,
    };
  }
}