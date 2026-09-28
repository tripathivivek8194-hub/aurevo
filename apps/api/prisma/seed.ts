import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

const CATEGORIES = [
  { name: 'Men', slug: 'men' },
  { name: 'Women', slug: 'women' },
  { name: 'Accessories', slug: 'accessories' },
  { name: 'Footwear', slug: 'footwear' },
  { name: 'Home & Living', slug: 'home-living' },
];

// Realistic starter catalog. All prices are in minor units (paise/cents), the
// storage unit used across the API and Razorpay. Idempotent by product slug.
// Images are stable placeholder URLs — swap for your own asset delivery later.
interface SeedVariant {
  name: string;
  sku: string;
  price: number;
  attributes: Record<string, string>;
  quantity?: number;
}

interface SeedProduct {
  name: string;
  slug: string;
  sku: string;
  basePrice: number;
  compareAtPrice?: number;
  categorySlug: string;
  shortDescription: string;
  images: string[];
  isFeatured?: boolean;
  variants?: SeedVariant[];
  quantity?: number; // only for non-variant products
}

const PRODUCTS: SeedProduct[] = [
  {
    name: 'Classic Oxford Shirt',
    slug: 'classic-oxford-shirt',
    sku: 'OXF-MEN-001',
    basePrice: 149900,
    compareAtPrice: 179900,
    categorySlug: 'men',
    shortDescription: 'Breathable cotton oxford, a wardrobe staple that dresses up or down.',
    images: ['https://picsum.photos/seed/oxford/800/1000'],
    isFeatured: true,
    variants: [
      { name: 'White / M', sku: 'OXF-MEN-001-W-M', price: 149900, attributes: { color: 'White', size: 'M' } },
      { name: 'White / L', sku: 'OXF-MEN-001-W-L', price: 149900, attributes: { color: 'White', size: 'L' } },
      { name: 'Sky Blue / M', sku: 'OXF-MEN-001-B-M', price: 149900, attributes: { color: 'Sky Blue', size: 'M' } },
      { name: 'Sky Blue / L', sku: 'OXF-MEN-001-B-L', price: 149900, attributes: { color: 'Sky Blue', size: 'L' } },
    ],
  },
  {
    name: 'Slim Fit Chinos',
    slug: 'slim-fit-chinos',
    sku: 'CHN-MEN-002',
    basePrice: 199900,
    categorySlug: 'men',
    shortDescription: 'Tailored chinos with a clean slim leg and subtle stretch.',
    images: ['https://picsum.photos/seed/chinos/800/1000'],
    variants: [
      { name: 'Khaki / 32', sku: 'CHN-MEN-002-K-32', price: 199900, attributes: { color: 'Khaki', size: '32' } },
      { name: 'Khaki / 34', sku: 'CHN-MEN-002-K-34', price: 199900, attributes: { color: 'Khaki', size: '34' } },
      { name: 'Navy / 32', sku: 'CHN-MEN-002-N-32', price: 199900, attributes: { color: 'Navy', size: '32' } },
      { name: 'Navy / 34', sku: 'CHN-MEN-002-N-34', price: 199900, attributes: { color: 'Navy', size: '34' } },
    ],
  },
  {
    name: 'Floral Midi Dress',
    slug: 'floral-midi-dress',
    sku: 'DRS-WMN-001',
    basePrice: 249900,
    compareAtPrice: 299900,
    categorySlug: 'women',
    shortDescription: 'Flowing floral midi with a flattering gathered waist.',
    images: ['https://picsum.photos/seed/midi/800/1000'],
    isFeatured: true,
    variants: [
      { name: 'S', sku: 'DRS-WMN-001-S', price: 249900, attributes: { size: 'S' } },
      { name: 'M', sku: 'DRS-WMN-001-M', price: 249900, attributes: { size: 'M' } },
      { name: 'L', sku: 'DRS-WMN-001-L', price: 249900, attributes: { size: 'L' } },
    ],
  },
  {
    name: 'Knit Cardigan',
    slug: 'knit-cardigan',
    sku: 'CDG-WMN-002',
    basePrice: 129900,
    categorySlug: 'women',
    shortDescription: 'Soft chunky-knit cardigan, cosy for layering.',
    images: ['https://picsum.photos/seed/cardigan/800/1000'],
    variants: [
      { name: 'Oat / S', sku: 'CDG-WMN-002-O-S', price: 129900, attributes: { color: 'Oat', size: 'S' } },
      { name: 'Oat / M', sku: 'CDG-WMN-002-O-M', price: 129900, attributes: { color: 'Oat', size: 'M' } },
    ],
  },
  {
    name: 'Genuine Leather Belt',
    slug: 'genuine-leather-belt',
    sku: 'BLT-ACC-001',
    basePrice: 79900,
    categorySlug: 'accessories',
    shortDescription: 'Full-grain leather belt with a brushed metal buckle.',
    images: ['https://picsum.photos/seed/belt/800/800'],
    variants: [
      { name: 'Brown / 36', sku: 'BLT-ACC-001-B-36', price: 79900, attributes: { color: 'Brown', size: '36' } },
      { name: 'Black / 36', sku: 'BLT-ACC-001-K-36', price: 79900, attributes: { color: 'Black', size: '36' } },
    ],
  },
  {
    name: 'Canvas Tote Bag',
    slug: 'canvas-tote-bag',
    sku: 'TOT-ACC-002',
    basePrice: 99900,
    categorySlug: 'accessories',
    shortDescription: 'Durable natural canvas tote with inner pocket.',
    images: ['https://picsum.photos/seed/tote/800/800'],
    isFeatured: true,
    quantity: 45,
  },
  {
    name: 'Aviator Sunglasses',
    slug: 'aviator-sunglasses',
    sku: 'SUN-ACC-003',
    basePrice: 119900,
    compareAtPrice: 149900,
    categorySlug: 'accessories',
    shortDescription: 'Classic aviator frame with UV-protective lenses.',
    images: ['https://picsum.photos/seed/aviator/800/800'],
    quantity: 30,
  },
  {
    name: 'Performance Running Shoes',
    slug: 'performance-running-shoes',
    sku: 'RUN-FTW-001',
    basePrice: 299900,
    categorySlug: 'footwear',
    shortDescription: 'Lightweight cushioned runners built for daily miles.',
    images: ['https://picsum.photos/seed/runners/800/1000'],
    isFeatured: true,
    variants: [
      { name: 'Black / 8', sku: 'RUN-FTW-001-K-8', price: 299900, attributes: { color: 'Black', size: '8' } },
      { name: 'Black / 9', sku: 'RUN-FTW-001-K-9', price: 299900, attributes: { color: 'Black', size: '9' } },
      { name: 'Black / 10', sku: 'RUN-FTW-001-K-10', price: 299900, attributes: { color: 'Black', size: '10' } },
      { name: 'Red / 9', sku: 'RUN-FTW-001-R-9', price: 299900, attributes: { color: 'Red', size: '9' } },
    ],
  },
  {
    name: 'Leather Loafers',
    slug: 'leather-loafers',
    sku: 'LFR-FTW-002',
    basePrice: 349900,
    categorySlug: 'footwear',
    shortDescription: 'Polished leather loafers with cushioned insole.',
    images: ['https://picsum.photos/seed/loafers/800/1000'],
    variants: [
      { name: 'Tan / 8', sku: 'LFR-FTW-002-T-8', price: 349900, attributes: { color: 'Tan', size: '8' } },
      { name: 'Tan / 9', sku: 'LFR-FTW-002-T-9', price: 349900, attributes: { color: 'Tan', size: '9' } },
      { name: 'Tan / 10', sku: 'LFR-FTW-002-T-10', price: 349900, attributes: { color: 'Tan', size: '10' } },
    ],
  },
  {
    name: 'Ceramic Mug Set',
    slug: 'ceramic-mug-set',
    sku: 'MUG-HOM-001',
    basePrice: 99900,
    categorySlug: 'home-living',
    shortDescription: 'Set of four stoneware mugs in earthy tones.',
    images: ['https://picsum.photos/seed/mugset/800/800'],
    quantity: 60,
  },
];

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seeding is disabled in production');
  }

  // Base categories — idempotent via their unique slug.
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
  }
  console.log(`Seeded ${CATEGORIES.length} categories`);

  // Starter catalog — idempotent via product slug. Creates the product, its
  // variants and images, then an inventory record per variant (or one for the
  // product when it has no variants).
  for (const p of PRODUCTS) {
    const category = await prisma.category.findUnique({ where: { slug: p.categorySlug } });
    if (!category) {
      console.warn(`Skipping ${p.slug}: category "${p.categorySlug}" not found`);
      continue;
    }

    await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        name: p.name,
        slug: p.slug,
        description: `AUREVO ${p.name} — ${p.shortDescription}`,
        shortDescription: p.shortDescription,
        sku: p.sku,
        basePrice: p.basePrice,
        compareAtPrice: p.compareAtPrice,
        currency: 'INR',
        status: 'ACTIVE',
        isFeatured: p.isFeatured ?? false,
        categoryId: category.id,
        images: {
          create: p.images.map((url, index) => ({
            url,
            alt: p.name,
            sortOrder: index,
            isPrimary: index === 0,
          })),
        },
        variants: p.variants
          ? {
              create: p.variants.map((v, index) => ({
                name: v.name,
                sku: v.sku,
                price: v.price,
                attributes: JSON.stringify(v.attributes),
                sortOrder: index,
                isActive: true,
              })),
            }
          : undefined,
      },
    });

    // Inventory: per-variant when the product has variants, else product-level.
    if (p.variants) {
      for (const v of p.variants) {
        const variant = await prisma.productVariant.findUnique({ where: { sku: v.sku } });
        if (variant) {
          await prisma.inventory.upsert({
            where: { variantId: variant.id },
            create: { productId: variant.productId, variantId: variant.id, quantity: v.quantity ?? 20, lowStockThreshold: 5 },
            update: {},
          });
        }
      }
    } else {
      const product = await prisma.product.findUnique({ where: { slug: p.slug } });
      if (product) {
        const existing = await prisma.inventory.findFirst({
          where: { productId: product.id, variantId: null },
        });
        if (!existing) {
          await prisma.inventory.create({
            data: { productId: product.id, quantity: p.quantity ?? 20, lowStockThreshold: 10 },
          });
        }
      }
    }

    console.log(`Seeded product ${p.slug}`);
  }

  // Default store owner from ADMIN_EMAIL so the admin panel is usable out of
  // the box. Supports comma-separated emails. Promotes existing users to ADMIN if needed.
  // The password is sourced from ADMIN_PASSWORD (env var) — never hardcoded — to prevent a
  // default-credential login on fresh deployments. When unset, a random
  // 32-char hex string is generated and printed once; copy it before the
  // terminal scrolls past.
  const adminEmailConfig = process.env.ADMIN_EMAIL;
  if (adminEmailConfig) {
    const adminEmails = adminEmailConfig
      .toLowerCase()
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);

    for (const adminEmail of adminEmails) {
      const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
      if (!existing) {
        const adminPassword = process.env.ADMIN_PASSWORD ?? crypto.randomBytes(16).toString('hex');
        const passwordHash = await bcrypt.hash(adminPassword, 12);
        await prisma.user.create({
          data: {
            email: adminEmail,
            passwordHash,
            firstName: 'Store',
            lastName: 'Owner',
            role: 'ADMIN',
            emailVerified: true,
          },
        });
        if (process.env.ADMIN_PASSWORD) {
          console.log(`Created admin user ${adminEmail} (password: <see ADMIN_PASSWORD>)`);
        } else {
          console.log(`Created admin user ${adminEmail} (generated password: ${adminPassword})`);
        }
      } else if (existing.role !== 'ADMIN') {
        await prisma.user.update({
          where: { id: existing.id },
          data: { role: 'ADMIN' },
        });
        console.log(`Promoted existing user ${adminEmail} to ADMIN`);
      }
    }
  }

  // A default standard shipping method so checkout has something to pick.
  const shippingCount = await prisma.shippingMethod.count();
  if (shippingCount === 0) {
    await prisma.shippingMethod.create({
      data: {
        name: 'Standard Shipping',
        code: 'standard',
        baseCost: 0,
        estimatedDays: 5,
        currency: 'INR',
        isActive: true,
      },
    });
    console.log('Created default standard shipping method');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
