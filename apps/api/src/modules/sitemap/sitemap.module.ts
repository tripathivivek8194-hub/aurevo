import { Module } from '@nestjs/common';
import { SitemapController } from './sitemap.controller';

/**
 * Sitemap is a thin read-only module: no service layer needed, it composes
 * Prisma (global) queries straight in the controller. Registered in AppModule.
 */
@Module({
  controllers: [SitemapController],
})
export class SitemapModule {}