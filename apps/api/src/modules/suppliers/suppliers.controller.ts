import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@aurevo/shared/types';

@ApiTags('Suppliers')
@Controller('suppliers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all suppliers (Admin only)' })
  async findAll() {
    return this.suppliersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get supplier by ID (Admin only)' })
  async findById(@Param('id') id: string) {
    return this.suppliersService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create supplier (Admin only)' })
  async create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update supplier (Admin only)' })
  async update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete supplier (Admin only)' })
  async delete(@Param('id') id: string) {
    return this.suppliersService.delete(id);
  }

  @Post(':id/test-connection')
  @ApiOperation({ summary: 'Test supplier connection (Admin only)' })
  async testConnection(@Param('id') id: string) {
    return this.suppliersService.testConnection(id);
  }

  @Post(':id/sync-catalog')
  @ApiOperation({ summary: 'Sync supplier catalog (Admin only)' })
  async syncCatalog(@Param('id') id: string) {
    return this.suppliersService.syncCatalog(id);
  }

  @Post(':id/sync-inventory')
  @ApiOperation({ summary: 'Sync supplier inventory (Admin only)' })
  async syncInventory(@Param('id') id: string) {
    return this.suppliersService.syncInventory(id);
  }

  @Post(':id/push-order')
  @ApiOperation({ summary: 'Push order to supplier (Admin only)' })
  async pushOrder(@Param('id') id: string, @Body() body: { orderId: string }) {
    return this.suppliersService.pushOrderToSupplier(id, body.orderId);
  }

  @Get(':id/order-status/:supplierOrderId')
  @ApiOperation({ summary: 'Get supplier order status (Admin only)' })
  async getOrderStatus(@Param('id') id: string, @Param('supplierOrderId') supplierOrderId: string) {
    return this.suppliersService.getSupplierOrderStatus(id, supplierOrderId);
  }

  @Get(':id/tracking/:supplierOrderId')
  @ApiOperation({ summary: 'Get supplier tracking (Admin only)' })
  async getTracking(@Param('id') id: string, @Param('supplierOrderId') supplierOrderId: string) {
    return this.suppliersService.getSupplierTracking(id, supplierOrderId);
  }

  @Post(':id/map-product')
  @ApiOperation({ summary: 'Map local product to supplier product (Admin only)' })
  async mapProduct(
    @Param('id') id: string,
    @Body() body: {
      supplierProductId: string;
      supplierVariantId?: string;
      productId: string;
      variantId?: string;
      mappingData?: Record<string, any>;
    },
  ) {
    return this.suppliersService.mapProduct(id, body);
  }

  @Get(':id/mapped-products')
  @ApiOperation({ summary: 'Get mapped products (Admin only)' })
  async getMappedProducts(@Param('id') id: string) {
    return this.suppliersService.getMappedProducts(id);
  }

  @Post(':id/link-product')
  @ApiOperation({ summary: 'Link product to supplier (Admin only)' })
  async linkProduct(@Param('id') id: string, @Body() body: { productId: string }) {
    return this.suppliersService.linkProduct(id, body.productId);
  }

  @Post(':id/unlink-product')
  @ApiOperation({ summary: 'Unlink product from supplier (Admin only)' })
  async unlinkProduct(@Param('id') id: string, @Body() body: { productId: string }) {
    return this.suppliersService.unlinkProduct(id, body.productId);
  }

  @Delete(':id/mapped-products/:mappingId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unmap product from supplier (Admin only)' })
  async unmapProduct(@Param('id') id: string, @Param('mappingId') mappingId: string) {
    return this.suppliersService.unmapProduct(id, mappingId);
  }
}