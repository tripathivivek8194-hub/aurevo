import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

type DependencyStatus = 'up' | 'down';

interface ReadinessResult {
  status: 'ready' | 'unavailable';
  checks: Record<string, DependencyStatus>;
  timestamp: string;
  uptime: number;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  readonly startTime = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  getLiveness() {
    return {
      status: 'ok',
      service: 'aurevo-api',
      version: process.env.npm_package_version ?? '0.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness(): Promise<ReadinessResult> {
    const checks: Record<string, DependencyStatus> = {};

    try {
      // Liveness of the primary persistence layer: run a trivial query.
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'up';
    } catch (error) {
      checks.database = 'down';
      this.logger.error(
        'Database readiness check failed',
        error instanceof Error ? error.stack : String(error)
      );
    }

    const ready = checks.database === 'up';
    return {
      status: ready ? 'ready' : 'unavailable',
      checks,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}