import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Liveness probe — the process is up and serving requests.
   */
  @Get()
  liveness() {
    return this.healthService.getLiveness();
  }

  /**
   * Readiness probe — returns 200 when core dependencies (DB) are reachable,
   * 503 otherwise, so orchestration can drain traffic during degraded startup.
   */
  @Get('ready')
  async readiness(@Res() res: Response) {
    const result = await this.healthService.getReadiness();
    return res.status(result.status === 'ready' ? 200 : 503).json(result);
  }
}