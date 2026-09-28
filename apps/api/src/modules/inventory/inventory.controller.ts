import { Controller, Get, Patch, Post, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@aurevo/shared/types';

@ApiTags('Inventory')
@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @ApiOperation({ summary: 'Get all inventory (Admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiQuery({ name: 'productId', required: false, type: String })
  @ApiQuery({ name: 'variantId', required: false, type: String })
  @ApiQuery({ name: 'lowStock', required: false, type: Boolean })
  @ApiQuery({ name: 'outOfStock', required: false, type: Boolean })
  @ApiQuery({ name: 'supplierId', required: false, type: String })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 50,
    @Query('productId') productId?: string,
    @Query('variantId') variantId?: string,
    @Query('lowStock') lowStock?: string,
    @Query('outOfStock') outOfStock?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.inventoryService.findAll({
      page: Number(page),
      limit: Number(limit),
      productId,
      variantId,
      lowStock: lowStock === 'true',
      outOfStock: outOfStock === 'true',
      supplierId,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get inventory statistics (Admin only)' })
  async getStats() {
    return this.inventoryService.getInventoryStats();
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'Get low stock items (Admin only)' })
  @ApiQuery({ name: 'threshold', required: false, type: Number, example: 10 })
  async getLowStock(@Query('threshold') threshold?: number) {
    return this.inventoryService.getLowStock(Number(threshold) ?? 10);
  }

  @Get('out-of-stock')
  @ApiOperation({ summary: 'Get out of stock items (Admin only)' })
  async getOutOfStock() {
    return this.inventoryService.getOutOfStock();
  }

  @Get('product/:productId')
  @ApiOperation({ summary: 'Get inventory by product ID (Admin only)' })
  @ApiQuery({ name: 'variantId', required: false, type: String })
  async findByProduct(@Param('productId') productId: string, @Query('variantId') variantId?: string) {
    return this.inventoryService.findByProduct(productId, variantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get inventory by ID (Admin only)' })
  async findById(@Param('id') id: string) {
    return this.inventoryService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update inventory (Admin only)' })
  async update(@Param('id') id: string, @Body() dto: UpdateInventoryDto) {
    return this.inventoryService.update(id, dto);
  }

  @Post(':id/adjust')
  @ApiOperation({ summary: 'Adjust inventory quantity (Admin only)' })
  async adjust(@Param('id') id: string, @Body() dto: AdjustInventoryDto) {
    return this.inventoryService.adjust(id, dto);
  }

  @Post('bulk-update')
  @ApiOperation({ summary: 'Bulk update inventory (Admin only)' })
  async bulkUpdate(@Body() body: { updates: { id: string; quantity?: number; lowStockThreshold?: number; trackQuantity?: boolean; allowBackorder?: boolean }[] }) {
    return this.inventoryService.bulkUpdate(body.updates);
  }
}