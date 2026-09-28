import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ShippingService } from './shipping.service';
import { CreateShippingMethodDto } from './dto/create-shipping-method.dto';
import { UpdateShippingMethodDto } from './dto/update-shipping-method.dto';
import { CalculateShippingDto } from './dto/calculate-shipping.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UserRole } from '@aurevo/shared/types';

@ApiTags('Shipping')
@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Get('methods')
  @Public()
  @ApiOperation({ summary: 'Get available shipping methods' })
  @ApiQuery({ name: 'country', required: false, type: String })
  @ApiQuery({ name: 'subtotal', required: false, type: Number })
  async getMethods(
    @Query('country') country?: string,
    @Query('subtotal') subtotal?: number,
  ) {
    return this.shippingService.getAvailableMethods(country, subtotal);
  }

  @Post('calculate')
  @Public()
  @ApiOperation({ summary: 'Calculate shipping costs' })
  async calculate(@Body() dto: CalculateShippingDto) {
    return this.shippingService.calculateShipping(dto);
  }

  @Get('zones')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get shipping zones (Admin only)' })
  async getZones() {
    return this.shippingService.getZones();
  }

  @Post('zones')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create shipping zone (Admin only)' })
  async createZone(@Body() body: { name: string; countryCodes: string[] }) {
    return this.shippingService.createZone(body.name, body.countryCodes);
  }

  // Admin CRUD for shipping methods
  @Get('methods/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all shipping methods (Admin only)' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  async findAllAdmin(@Query('includeInactive') includeInactive?: string) {
    return this.shippingService.findAll(includeInactive === 'true');
  }

  @Get('methods/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get shipping method by ID (Admin only)' })
  async findById(@Param('id') id: string) {
    return this.shippingService.findById(id);
  }

  @Post('methods')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create shipping method (Admin only)' })
  async create(@Body() dto: CreateShippingMethodDto) {
    return this.shippingService.create(dto);
  }

  @Patch('methods/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update shipping method (Admin only)' })
  async update(@Param('id') id: string, @Body() dto: UpdateShippingMethodDto) {
    return this.shippingService.update(id, dto);
  }

  @Delete('methods/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete shipping method (Admin only)' })
  async delete(@Param('id') id: string) {
    return this.shippingService.delete(id);
  }

  @Post('methods/reorder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reorder shipping methods (Admin only)' })
  async reorder(@Body() body: { ids: string[] }) {
    return this.shippingService.reorder(body.ids);
  }
}