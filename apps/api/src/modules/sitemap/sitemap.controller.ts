import { Controller, Get, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { Public } from '../../common/decorators/public.decorator';

interface SitemapEntry {
  url: string;
  lastmod?: string;
  changefreq: 'daily' | 'weekly' | 'monthly';
  priority: string;
}

/**
 * Escape a value for safe insertion into an XML text node. Slugs are
 * admin-supplied, so this guards against stray `&`, `<`, `>` characters
 * breaking the document or the sitemap parser.
 */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

@Controller('sitemap')
export class SitemapController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * GET /api/sitemap/xml (public edge URL: /sitemap.xml) — dynamic XML sitemap of the indexable storefront.
   *
   * Only public catalog pages are listed. Admin, account, cart, checkout and
   * payment paths are deliberately excluded: they sit behind auth or provide
   * no SEO value (robots.txt also blocks them). The origin is read from
   * WEB_URL so generated URLs point at the real storefront once a domain is
   * configured (falls back to the local dev origin).
   */
  @Get('xml')
  @Public()
  @Header('Content-Type', 'application/xml; charset=utf-8')
  async sitemap(): Promise<string> {
    // Production Compose supplies WEB_URL from SITE_URL=https://www.aurevo.buzz.
    const origin = (this.config.get<string>('WEB_URL') ?? 'http://localhost:3000').replace(/\/+$/, '');

    const [products, categories] = await Promise.all([
      this.prisma.product.findMany({
        where: { status: 'ACTIVE' },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.category.findMany({
        where: { isActive: true },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const today = new Date().toISOString();

    const helpPages = [
      'shipping',
      'returns',
      'privacy',
      'terms',
    ];

    const entries: SitemapEntry[] = [
      { url: `${origin}/`, lastmod: today, changefreq: 'daily', priority: '1.0' },
      { url: `${origin}/products`, lastmod: today, changefreq: 'daily', priority: '0.9' },
      { url: `${origin}/about`, lastmod: today, changefreq: 'monthly', priority: '0.5' },
      { url: `${origin}/contact`, lastmod: today, changefreq: 'monthly', priority: '0.5' },
      // Customer-help pages linked in the storefront footer.
      ...helpPages.map((page) => ({
        url: `${origin}/help/${page}`,
        lastmod: today,
        changefreq: 'monthly' as const,
        priority: '0.4',
      })),
      // Category landing pages (monthly — catalog structure rarely churns).
      ...categories.map((c) => ({
        url: `${origin}/products?category=${encodeURIComponent(c.slug)}`,
        lastmod: c.updatedAt.toISOString(),
        changefreq: 'monthly' as const,
        priority: '0.6',
      })),
      // Product pages (weekly — prices/stock change more often than categories).
      ...products.map((p) => ({
        url: `${origin}/products/${encodeURIComponent(p.slug)}`,
        lastmod: p.updatedAt.toISOString(),
        changefreq: 'weekly' as const,
        priority: '0.8',
      })),
    ];

    return this.buildXml(entries);
  }

  private buildXml(entries: SitemapEntry[]): string {
    const urlTags = entries
      .map(
        (e) =>
          '  <url>\n' +
          `    <loc>${xmlEscape(e.url)}</loc>\n` +
          (e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>\n` : '') +
          `    <changefreq>${e.changefreq}</changefreq>\n` +
          `    <priority>${e.priority}</priority>\n` +
          '  </url>',
      )
      .join('\n');

    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urlTags +
      '\n</urlset>\n'
    );
  }
}
