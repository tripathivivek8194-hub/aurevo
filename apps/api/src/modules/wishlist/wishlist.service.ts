import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Security guard: the wishlist payload is returned to an authenticated
   * storefront client and included full product rows. Landed `cost` must never
   * leave the server on a user-facing endpoint, so it is stripped before
   * anything is returned (mirrors ProductsService.stripCost).
   */
  private stripCost<T extends Record<string, unknown>>(obj: T): T {
    if (!obj || typeof obj !== 'object' || !('cost' in obj)) return obj;
    const { cost: _, ...rest } = obj as any;
    return rest as T;
  }

  /** Strip cost from every product nested in a wishlist item. */
  private sanitizeItem(item: any): any {
    return { ...item, product: this.stripCost(item.product) };
  }

  async getWishlist(userId: string) {
    let wishlist = await this.prisma.wishlist.findUnique({
      where: { userId },
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
            variant: { include: { inventory: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!wishlist) {
      wishlist = await this.prisma.wishlist.create({
        data: { userId },
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
              variant: { include: { inventory: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
    }

    return { ...wishlist, items: wishlist.items.map((item: any) => this.sanitizeItem(item)) };
  }

  async addItem(userId: string, productId: string, variantId?: string) {
    let wishlist = await this.prisma.wishlist.findUnique({ where: { userId } });

    if (!wishlist) {
      wishlist = await this.prisma.wishlist.create({ data: { userId } });
    }

    const existing = await this.prisma.wishlistItem.findFirst({
      where: { wishlistId: wishlist.id, productId, variantId },
    });

    if (existing) {
      return { message: 'Already in wishlist', item: existing };
    }

    // Verify product exists
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (variantId) {
      const variant = await this.prisma.productVariant.findFirst({
        where: { id: variantId, productId },
      });
      if (!variant) {
        throw new NotFoundException('Variant not found');
      }
    }

    const item = await this.prisma.wishlistItem.create({
      data: { wishlistId: wishlist.id, productId, variantId },
      include: {
        product: { include: { images: { where: { isPrimary: true }, take: 1 } } },
        variant: true,
      },
    });

    return { message: 'Added to wishlist', item: this.sanitizeItem(item) };
  }

  async removeItem(userId: string, productId: string, variantId?: string) {
    const wishlist = await this.prisma.wishlist.findUnique({ where: { userId } });
    if (!wishlist) {
      throw new NotFoundException('Wishlist not found');
    }

    await this.prisma.wishlistItem.deleteMany({
      where: { wishlistId: wishlist.id, productId, variantId },
    });

    return { message: 'Removed from wishlist' };
  }

  async clearWishlist(userId: string) {
    const wishlist = await this.prisma.wishlist.findUnique({ where: { userId } });
    if (!wishlist) {
      throw new NotFoundException('Wishlist not found');
    }

    await this.prisma.wishlistItem.deleteMany({ where: { wishlistId: wishlist.id } });
    return { message: 'Wishlist cleared' };
  }

  async isInWishlist(userId: string, productId: string, variantId?: string) {
    const wishlist = await this.prisma.wishlist.findUnique({ where: { userId } });
    if (!wishlist) return false;

    const item = await this.prisma.wishlistItem.findFirst({
      where: { wishlistId: wishlist.id, productId, variantId },
    });

    return !!item;
  }
}