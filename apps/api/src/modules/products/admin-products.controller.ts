import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole, ProductStatus } from '@aurevo/shared/types';

/**
 * Admin-only product READS that include landed cost + computed marginPct.
 *
 * Every PUBLIC products endpoint strips `cost` before responding. The admin
 * form needs cost back for the margin readout, and the admin list needs
 * marginPct — so this controller re-reads the same rows behind the ADMIN role.
 * Nothing here is reachable by the storefront (JwtAuthGuard + RolesGuard).
 */
@ApiTags('Products (admin)')
@Controller('admin/products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: list products with cost retained + marginPct' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'categoryId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'] })
  @ApiQuery({ name: 'isFeatured', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'supplierId', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String, example: 'createdAt' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], example: 'desc' })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: ProductStatus,
    @Query('isFeatured') isFeatured?: string,
    @Query('search') search?: string,
    @Query('supplierId') supplierId?: string,
    @Query('sortBy') sortBy = 'createdAt',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
  ) {
    return this.productsService.findAll(
      {
        page: Number(page),
        limit: Number(limit),
        categoryId,
        status,
        isFeatured: isFeatured === 'true' ? true : isFeatured === 'false' ? false : undefined,
        search,
        supplierId,
        sortBy,
        sortOrder,
      },
      { admin: true },
    );
  }

  @Post('pricing/repair-zero-prices')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: set safe 30% margin prices on zero-priced products with known supplier cost' })
  async repairZeroPrices() {
    return this.productsService.repairZeroPrices();
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: get product by ID with cost retained + marginPct' })
  async findById(@Param('id') id: string) {
    return this.productsService.findById(id, { admin: true });
  }
}
