import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { AnalyticsService } from './analytics.service';

const STORE_EVENTS = ['SESSION', 'PRODUCT_VIEW', 'ADD_TO_CART', 'CHECKOUT_STARTED'] as const;
const TRAFFIC_SOURCES = ['DIRECT', 'ORGANIC_SEARCH', 'SOCIAL', 'REFERRAL', 'CAMPAIGN'] as const;

class RecordAnalyticsEventDto {
  @IsUUID()
  visitorId!: string;

  @IsIn(STORE_EVENTS)
  event!: (typeof STORE_EVENTS)[number];

  @IsOptional()
  @IsIn(TRAFFIC_SOURCES)
  source?: (typeof TRAFFIC_SOURCES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(240)
  path?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  productId?: string;
}

@Controller('analytics/events')
export class AnalyticsEventsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async record(@Body() body: RecordAnalyticsEventDto) {
    await this.analyticsService.recordStoreEvent(body);
    return { accepted: true };
  }
}
