import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    page?: number;
    limit?: number;
    productId?: string;
    userId?: string;
    status?: string;
    rating?: number;
  }) {
    const { page = 1, limit = 20, productId, userId, status, rating } = params;

    const where: any = {};
    if (productId) where.productId = productId;
    if (userId) where.userId = userId;
    if (status) where.status = status;
    if (rating) where.rating = rating;

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          product: { select: { id: true, name: true, sku: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.review.count({ where }),
    ]);

    return { data: reviews, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        product: { select: { id: true, name: true, sku: true } },
        order: { select: { id: true, orderNumber: true } },
      },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return review;
  }

  async findByProduct(productId: string, params: { page?: number; limit?: number; status?: string }) {
    const { page = 1, limit = 10, status = 'APPROVED' } = params;

    const where: any = { productId, status };

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.review.count({ where }),
    ]);

    // Calculate average rating
    const stats = await this.prisma.review.aggregate({
      where: { productId, status: 'APPROVED' },
      _avg: { rating: true },
      _count: { id: true },
    });

    const ratingDistribution = await this.prisma.review.groupBy({
      by: ['rating'],
      where: { productId, status: 'APPROVED' },
      _count: { id: true },
    });

    return {
      data: reviews,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      stats: {
        averageRating: stats._avg.rating ?? 0,
        totalReviews: stats._count.id ?? 0,
        distribution: ratingDistribution.reduce((acc, item) => {
          acc[item.rating] = item._count.id;
          return acc;
        }, {} as Record<number, number>),
      },
    };
  }

  async create(userId: string, dto: CreateReviewDto) {
    // Verify product exists
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Check if user already reviewed this product
    const existing = await this.prisma.review.findFirst({
      where: { userId, productId: dto.productId },
    });

    if (existing) {
      throw new ConflictException('You have already reviewed this product');
    }

    // Verify purchase if orderId provided
    let isVerifiedPurchase = false;
    if (dto.orderId) {
      const order = await this.prisma.order.findFirst({
        where: { id: dto.orderId, userId },
        include: { items: { where: { productId: dto.productId } } },
      });

      if (order && order.items.length > 0) {
        isVerifiedPurchase = true;
      } else {
        throw new BadRequestException('Order not found or does not contain this product');
      }
    }

    const review = await this.prisma.review.create({
      data: {
        userId,
        productId: dto.productId,
        orderId: dto.orderId,
        rating: dto.rating,
        title: dto.title,
        content: dto.content,
        isVerifiedPurchase,
        status: 'PENDING',
      },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    return review;
  }

  async update(userId: string, reviewId: string, dto: UpdateReviewDto) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.userId !== userId) {
      throw new ForbiddenException('Not authorized to update this review');
    }

    if (review.status !== 'PENDING') {
      throw new ConflictException('Cannot update review that has been moderated');
    }

    return this.prisma.review.update({
      where: { id: reviewId },
      data: {
        rating: dto.rating,
        title: dto.title,
        content: dto.content,
      },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
  }

  async delete(userId: string, reviewId: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.userId !== userId) {
      throw new ForbiddenException('Not authorized to delete this review');
    }

    await this.prisma.review.delete({ where: { id: reviewId } });
    return { message: 'Review deleted successfully' };
  }

  // Admin moderation
  async moderate(reviewId: string, status: string, adminNotes?: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return this.prisma.review.update({
      where: { id: reviewId },
      data: { status, adminNotes },
      include: { user: { select: { firstName: true, lastName: true } }, product: { select: { name: true } } },
    });
  }

  async bulkModerate(reviewIds: string[], status: string) {
    await this.prisma.review.updateMany({
      where: { id: { in: reviewIds } },
      data: { status },
    });
    return { message: `${reviewIds.length} reviews updated`, updated: reviewIds.length };
  }

  async getReviewStats(productId?: string) {
    const where = productId ? { productId } : {};

    const [total, approved, pending, rejected, avgRating] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.count({ where: { ...where, status: 'APPROVED' } }),
      this.prisma.review.count({ where: { ...where, status: 'PENDING' } }),
      this.prisma.review.count({ where: { ...where, status: 'REJECTED' } }),
      this.prisma.review.aggregate({
        where: { ...where, status: 'APPROVED' },
        _avg: { rating: true },
      }),
    ]);

    return {
      total,
      approved,
      pending,
      rejected,
      averageRating: avgRating._avg.rating ?? 0,
    };
  }
}