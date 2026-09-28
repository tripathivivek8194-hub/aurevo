import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@aurevo/shared/types';

@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('revenue')
  @ApiOperation({ summary: 'Get revenue analytics' })
  @ApiQuery({ name: 'startDate', required: true, type: String, example: '2024-01-01' })
  @ApiQuery({ name: 'endDate', required: true, type: String, example: '2024-01-31' })
  async getRevenue(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.analyticsService.getRevenueAnalytics({
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });
  }

  @Get('funnel')
  @ApiOperation({ summary: 'Get conversion funnel' })
  @ApiQuery({ name: 'startDate', required: true, type: String, example: '2024-01-01' })
  @ApiQuery({ name: 'endDate', required: true, type: String, example: '2024-01-31' })
  async getFunnel(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.analyticsService.getConversionFunnel({
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });
  }

  @Get('customers')
  @ApiOperation({ summary: 'Get customer analytics' })
  @ApiQuery({ name: 'startDate', required: true, type: String, example: '2024-01-01' })
  @ApiQuery({ name: 'endDate', required: true, type: String, example: '2024-01-31' })
  async getCustomers(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.analyticsService.getCustomerAnalytics({
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });
  }

  @Get('products')
  @ApiOperation({ summary: 'Get product analytics' })
  @ApiQuery({ name: 'startDate', required: true, type: String, example: '2024-01-01' })
  @ApiQuery({ name: 'endDate', required: true, type: String, example: '2024-01-31' })
  async getProducts(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.analyticsService.getProductAnalytics({
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });
  }

  @Get('traffic')
  @ApiOperation({ summary: 'Get traffic sources' })
  async getTraffic() {
    return this.analyticsService.getTrafficSources();
  }

  @Get('realtime')
  @ApiOperation({ summary: 'Get real-time stats' })
  async getRealtime() {
    return this.analyticsService.getRealTimeStats();
  }
}