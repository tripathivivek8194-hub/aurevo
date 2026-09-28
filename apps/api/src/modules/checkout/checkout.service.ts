import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CartService } from '../cart/cart.service';
import { ShippingService } from '../shipping/shipping.service';
import { EmailService } from '../email/email.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus, PaymentStatus } from '@aurevo/shared/types';
import { generateOrderNumber } from '@aurevo/shared';

const GST_RATE = 0.18;

/** Return the GST component already included in a tax-inclusive price. */
function includedGst(amount: number): number {
  return Math.round((amount * GST_RATE) / (1 + GST_RATE));
}

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
    private readonly shippingService: ShippingService,
    private readonly emailService: EmailService,
  ) {}

  async previewOrder(userId: string | undefined, sessionId: string | undefined, shippingMethodId?: string) {
    const validation = await this.cartService.validateCartForCheckout(userId, sessionId);

    if (!validation.isValid) {
      throw new ConflictException({ message: 'Cart validation failed', issues: validation.issues });
    }

    const cart = validation.cart;
    const subtotal = cart.items.reduce((sum, item) => sum + item.priceSnapshot * item.quantity, 0);

    // Calculate shipping
    let shippingCost = 0;
    let shippingMethod = null;

    if (shippingMethodId) {
      const methods = await this.shippingService.getAvailableMethods();
      shippingMethod = methods.find(m => m.id === shippingMethodId);
      if (shippingMethod) {
        shippingCost = shippingMethod.baseCost;
        // Add per-item costs if applicable
        for (const item of cart.items) {
          shippingCost += (shippingMethod.perItemCost ?? 0) * item.quantity;
        }
      }
    }

    // Storefront prices are customer-facing, tax-inclusive prices. Record the
    // included GST component for order reporting without charging it twice.
    const tax = includedGst(subtotal);
    const total = subtotal + shippingCost;

    return {
      subtotal,
      shippingCost,
      tax,
      total,
      currency: 'INR',
      items: cart.items.map(item => ({
        productId: item.productId,
        variantId: item.variantId,
        productName: item.product.name,
        variantName: item.variant?.name,
        quantity: item.quantity,
        unitPrice: item.priceSnapshot,
        totalPrice: item.priceSnapshot * item.quantity,
      })),
      shippingMethod: shippingMethod ? {
        id: shippingMethod.id,
        name: shippingMethod.name,
        estimatedDays: shippingMethod.estimatedDays,
      } : null,
    };
  }

  async createOrder(userId: string | undefined, sessionId: string | undefined, dto: CreateOrderDto) {
    // Coupon codes are accepted by the DTO but never applied to totals. Reject
    // them loudly instead of silently charging full price to a customer who
    // believes they redeemed a discount.
    if (dto.couponCode && dto.couponCode.trim().length > 0) {
      throw new BadRequestException('Coupons are not supported yet — couponCode must be omitted');
    }

    const validation = await this.cartService.validateCartForCheckout(userId, sessionId);

    if (!validation.isValid) {
      throw new ConflictException({ message: 'Cart validation failed', issues: validation.issues });
    }

    const cart = validation.cart;

    if (cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    // Calculate totals
    const subtotal = cart.items.reduce((sum, item) => sum + item.priceSnapshot * item.quantity, 0);

    let shippingCost = 0;
    let shippingMethod = null;

    if (dto.shippingMethodId) {
      const methods = await this.shippingService.getAvailableMethods();
      shippingMethod = methods.find(m => m.id === dto.shippingMethodId);
      if (shippingMethod) {
        shippingCost = shippingMethod.baseCost;
        for (const item of cart.items) {
          shippingCost += (shippingMethod.perItemCost ?? 0) * item.quantity;
        }
      }
    }

    const tax = includedGst(subtotal);
    const total = subtotal + shippingCost;

    // Generate order number
    const orderNumber = generateOrderNumber();

    // Create order in transaction
    const order = await this.prisma.$transaction(async (tx) => {
      // Create order
      const order = await tx.order.create({
        data: {
          orderNumber,
          userId: userId ?? null,
          sessionId: sessionId ?? null,
          email: dto.email,
          status: 'PAYMENT_PENDING',
          subtotal,
          shippingCost,
          tax,
          discount: 0,
          total,
          currency: 'INR',
          shippingAddress: JSON.stringify(dto.shippingAddress),
          billingAddress: JSON.stringify(dto.billingAddress ?? dto.shippingAddress),
          notes: dto.notes,
        },
      });

      // Create order items
      for (const item of cart.items) {
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: item.productId,
            variantId: item.variantId,
            productName: item.product.name,
            productSku: item.product.sku,
            variantName: item.variant?.name,
            quantity: item.quantity,
            unitPrice: item.priceSnapshot,
            totalPrice: item.priceSnapshot * item.quantity,
          },
        });
      }

      // Reserve inventory atomically. The availability check and the increment
      // must be a single conditional UPDATE so that concurrent checkouts cannot
      // both read the same available stock and then over-commit reservedQuantity
      // (TOCTOU race). Rows affected === 0 means there is insufficient stock for
      // this item -- unless backorder is enabled, which intentionally oversells
      // -- and the thrown error rolls back the whole transaction, so no order is
      // created and no stock is over-reserved. Integer paise are unaffected: the
      // quantities here are plain unit counts.
      for (const item of cart.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          include: { variants: { include: { inventory: true } }, inventory: true },
        });

        if (!product) continue;

        const variant = item.variantId
          ? product.variants.find(v => v.id === item.variantId)
          : null;

        const inventory = variant?.inventory ?? product.inventory?.[0];

        if (inventory && inventory.trackQuantity) {
          const reserved = await tx.$executeRaw`
            UPDATE "inventory"
            SET "reservedQuantity" = "reservedQuantity" + ${item.quantity}
            WHERE "id" = ${inventory.id}
              AND ("quantity" - "reservedQuantity" >= ${item.quantity} OR "allowBackorder" = true)
          `;

          if (reserved === 0) {
            throw new ConflictException(
              `Insufficient inventory for "${product.name}"`,
            );
          }
        }
      }

      // Clear cart
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return order;
    });

    // F1: send the order confirmation (place-notification). Fires post-commit so
    // a transient email failure can never roll back the order itself — the
    // EmailService already swallows errors and logs them.
    void this.emailService.sendOrderConfirmation(dto.email, {
      orderNumber: order.orderNumber,
      total: order.total,
      currency: order.currency,
      items: cart.items.map((item) => ({
        productName: item.product.name,
        quantity: item.quantity,
        unitPrice: item.priceSnapshot,
      })),
    });

    return {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.total,
        currency: order.currency,
      },
      // Payment will be initiated separately
    };
  }

  async getOrderById(orderId: string, userId?: string, sessionId?: string) {
    const where: any = { id: orderId };
    if (userId) {
      where.userId = userId;
    }

    const order = await this.prisma.order.findFirst({
      where,
      include: {
        items: {
          include: {
            product: { select: { name: true, slug: true, images: { where: { isPrimary: true }, take: 1 } } },
            variant: true,
          },
        },
        payments: true,
        shipments: { include: { trackingEvents: { orderBy: { timestamp: 'asc' } } } },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // S3: Guest orders require sessionId proof — without userId-based scoping,
    // the only authorization is possession of the sessionId created at checkout.
    // Return 404 (not 403) so an attacker cannot confirm order existence.
    this.assertGuestReadAuth(order, userId, sessionId);

    return order;
  }

  async getOrderByNumber(orderNumber: string, userId?: string, sessionId?: string) {
    const where: any = { orderNumber };
    if (userId) {
      where.userId = userId;
    }

    const order = await this.prisma.order.findFirst({
      where,
      include: {
        items: {
          include: {
            product: { select: { name: true, slug: true, images: { where: { isPrimary: true }, take: 1 } } },
            variant: true,
          },
        },
        payments: true,
        shipments: { include: { trackingEvents: { orderBy: { timestamp: 'asc' } } } },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // S3: Guest orders require sessionId proof — same rationale as getOrderById.
    this.assertGuestReadAuth(order, userId, sessionId);

    return order;
  }

  /**
   * S3: Authorization gate for guest order reads. Authenticated callers
   * (userId present) are already scoped by the Prisma `where` clause; this
   * method covers the unauthenticated path where no userId scoping was applied.
   *
   * Guest orders (order.userId === null) require the caller to present the
   * sessionId created at checkout. Without it, the request is rejected with 404
   * (never 403) so an attacker cannot confirm whether an order ID/number exists.
   *
   * This mirrors `PaymentsService.assertPayableAuth` but applies to reads:
   * the same session that authorized checkout also authorizes viewing the order.
   */
  private assertGuestReadAuth(
    order: { userId: string | null; sessionId?: string | null },
    userId?: string,
    sessionId?: string,
  ): void {
    // Authenticated callers are already scoped by `where.userId` — nothing
    // additional to prove.
    if (userId) return;

    // Guest order: require possession of the creating session.
    if (!order.sessionId || !sessionId || order.sessionId !== sessionId) {
      throw new NotFoundException('Order not found');
    }
  }
}
