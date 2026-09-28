import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UserRole, ProductStatus } from '@aurevo/shared/types';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all products with filters' })
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
    return this.productsService.findAll({
      page: Number(page),
      limit: Number(limit),
      categoryId,
      status,
      isFeatured: isFeatured === 'true' ? true : isFeatured === 'false' ? false : undefined,
      search,
      supplierId,
      sortBy,
      sortOrder,
    });
  }

  @Get('featured')
  @Public()
  @ApiOperation({ summary: 'Get featured products' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 8 })
  async getFeatured(@Query('limit') limit = 8) {
    return this.productsService.getFeatured(Number(limit));
  }

  @Get('search')
  @Public()
  @ApiOperation({ summary: 'Search products' })
  @ApiQuery({ name: 'q', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  async search(@Query('q') query: string, @Query('limit') limit = 20) {
    return this.productsService.search(query, Number(limit));
  }

  @Get(':slug')
  @Public()
  @ApiOperation({ summary: 'Get product by slug' })
  async findBySlug(@Param('slug') slug: string) {
    return this.productsService.findBySlug(slug);
  }

  @Get('id/:id')
  @Public()
  @ApiOperation({ summary: 'Get product by ID' })
  async findById(@Param('id') id: string) {
    return this.productsService.findById(id);
  }

  @Get(':id/related')
  @Public()
  @ApiOperation({ summary: 'Get related products' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 4 })
  async getRelated(@Param('id') id: string, @Query('limit') limit = 4) {
    return this.productsService.getRelated(id, Number(limit));
  }

  // Variants
  @Get(':id/variants')
  @Public()
  @ApiOperation({ summary: 'Get product variants' })
  async getVariants(@Param('id') id: string) {
    return this.productsService.getVariants(id);
  }

  @Post(':id/variants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create product variant (Admin only)' })
  async createVariant(@Param('id') id: string, @Body() dto: CreateVariantDto) {
    return this.productsService.createVariant(id, dto);
  }

  @Patch(':id/variants/:variantId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product variant (Admin only)' })
  async updateVariant(@Param('id') id: string, @Param('variantId') variantId: string, @Body() dto: UpdateVariantDto) {
    return this.productsService.updateVariant(id, variantId, dto);
  }

  @Delete(':id/variants/:variantId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete product variant (Admin only)' })
  async deleteVariant(@Param('id') id: string, @Param('variantId') variantId: string) {
    return this.productsService.deleteVariant(id, variantId);
  }

  // Images
  @Get(':id/images')
  @Public()
  @ApiOperation({ summary: 'Get product images' })
  async getImages(@Param('id') id: string) {
    return this.productsService.getImages(id);
  }

  @Post(':id/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add product image (Admin only)' })
  async addImage(
    @Param('id') id: string,
    @Body() body: { url: string; alt?: string; isPrimary?: boolean },
  ) {
    return this.productsService.addImage(id, body.url, body.alt, body.isPrimary);
  }

  @Patch('images/:imageId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product image (Admin only)' })
  async updateImage(
    @Param('imageId') imageId: string,
    @Body() body: { url?: string; alt?: string; sortOrder?: number; isPrimary?: boolean },
  ) {
    return this.productsService.updateImage(imageId, body);
  }

  @Delete('images/:imageId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete product image (Admin only)' })
  async deleteImage(@Param('imageId') imageId: string) {
    return this.productsService.deleteImage(imageId);
  }

  @Post(':id/images/reorder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reorder product images (Admin only)' })
  async reorderImages(@Param('id') id: string, @Body() body: { ids: string[] }) {
    return this.productsService.reorderImages(id, body.ids);
  }

  // Admin CRUD
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create product (Admin only)' })
  async create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product (Admin only)' })
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete product (Admin only)' })
  async delete(@Param('id') id: string) {
    return this.productsService.delete(id);
  }
}