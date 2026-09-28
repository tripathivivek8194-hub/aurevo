import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@aurevo/shared/types';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get admin dashboard statistics' })
  async getDashboard() {
    return this.adminService.getDashboardStats();
  }

  @Get('reports/sales')
  @ApiOperation({ summary: 'Get sales report' })
  @ApiQuery({ name: 'startDate', required: true, type: String, example: '2024-01-01' })
  @ApiQuery({ name: 'endDate', required: true, type: String, example: '2024-01-31' })
  @ApiQuery({ name: 'groupBy', required: false, enum: ['day', 'week', 'month'], example: 'day' })
  async getSalesReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('groupBy') groupBy: 'day' | 'week' | 'month' = 'day',
  ) {
    return this.adminService.getSalesReport({
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      groupBy,
    });
  }

  @Get('reports/products')
  @ApiOperation({ summary: 'Get product performance report' })
  async getProductReport() {
    return this.adminService.getProductReport();
  }

  @Get('reports/customers')
  @ApiOperation({ summary: 'Get customer report' })
  async getCustomerReport() {
    return this.adminService.getCustomerReport();
  }

  @Get('reports/inventory')
  @ApiOperation({ summary: 'Get inventory report' })
  async getInventoryReport() {
    return this.adminService.getInventoryReport();
  }
}