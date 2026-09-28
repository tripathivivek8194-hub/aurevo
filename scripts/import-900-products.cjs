const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();
const API_BASE = 'http://127.0.0.1:4000/api';
const TARGET_PER_CATEGORY = 100;

const catalogPlan = [
  {
    name: 'Tech Accessories',
    slug: 'tech-accessories',
    description: 'Useful electronics, audio, charging and everyday device accessories.',
    sortOrder: 10,
    feedName: 'DS_ConsumerElectronics_bestsellers',
    country: 'US',
    benefit: 'everyday electronics, entertainment and connected-device setups',
  },
  {
    name: 'Desk & Workspace',
    slug: 'desk-workspace',
    description: 'Practical computer, desk and productivity accessories.',
    sortOrder: 20,
    feedName: 'AEB_ ComputerAccessories_EG',
    country: 'EG',
    benefit: 'home offices, study spaces and productive desk setups',
  },
  {
    name: 'Home Essentials',
    slug: 'home-essentials',
    description: 'Useful kitchen, storage, cleaning and home-living products.',
    sortOrder: 30,
    feedName: 'DS_Home&Kitchen_bestsellers',
    country: 'US',
    benefit: 'practical cooking, storage, cleaning and home organization',
  },
  {
    name: 'Personal Care & Grooming',
    slug: 'personal-care-grooming',
    description: 'Everyday grooming, skincare and personal-care tools.',
    sortOrder: 40,
    feedName: 'DS_Beauty_bestsellers',
    country: 'US',
    benefit: 'simple daily grooming and personal-care routines',
  },
  {
    name: 'Sports & Outdoors',
    slug: 'sports-outdoors',
    description: 'Fitness, cycling, camping and outdoor-use accessories.',
    sortOrder: 50,
    feedName: 'DS_Sports&Outdoors_bestsellers',
    country: 'US',
    benefit: 'fitness, cycling, camping and outdoor activities',
  },
  {
    name: 'Automotive Accessories',
    slug: 'automotive-accessories',
    description: 'Practical car-care, replacement and travel accessories.',
    sortOrder: 60,
    feedName: 'DS_Automobile&Accessories_bestsellers',
    country: 'US',
    benefit: 'vehicle care, maintenance and more convenient journeys',
  },
  {
    name: 'Pet Supplies',
    slug: 'pet-supplies',
    description: 'Useful accessories for cats, dogs, aquariums and small pets.',
    sortOrder: 70,
    feedName: 'pets&supplies_ZA topsellers_ 20240423',
    country: 'ZA',
    benefit: 'everyday pet care, feeding, play and comfortable living spaces',
  },
  {
    name: 'Home & Garden',
    slug: 'home-garden',
    description: 'Useful garden, organization and home-improvement products.',
    sortOrder: 80,
    feedName: 'AEB_US_Home&Garden_TopSellers',
    country: 'US',
    benefit: 'gardening, home organization and everyday improvement projects',
  },
  {
    name: 'Toys & Hobbies',
    slug: 'toys-hobbies',
    description: 'Creative, educational and recreational products for modern hobbies.',
    sortOrder: 90,
    feedName: 'AEB_SHOPLAZZA_Toys&Hobbies_$10~20_20241118',
    country: 'US',
    benefit: 'creative play, learning and enjoyable hobbies',
  },
];

const blockedTerms = [
  /\b(adult|sex toy|dildo|vibrator|masturbat|fetish|erotic)\b/i,
  /\b(vape|vaping|cigarette|tobacco|hookah)\b/i,
  /\b(gun|rifle|pistol|ammunition|crossbow|switchblade)\b/i,
  /\b(mystery box|surprise box|random product)\b/i,
  /\b(covid|insulin|syringe|surgical implant)\b/i,
];

function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function titleCaseIfNeeded(value) {
  const letters = value.replace(/[^A-Za-z]/g, '');
  if (!letters || (value !== value.toUpperCase() && value !== value.toLowerCase())) return value;
  return value.toLowerCase().replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function cleanProductName(source, productId) {
  let value = decodeEntities(source)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[《》【】]/g, ' ')
    .replace(/^(?:in stock|ready stock|new|hot)\s+/i, '')
    .replace(/\b20(?:1[8-9]|2[0-9])\b/g, '')
    .replace(/\b(q version|latest version)\b/gi, '')
    .replace(/\b(new arrival|hot sale|best seller|bestseller|free shipping|dropshipping|wholesale)\b/gi, '')
    .replace(/\bnewest\b/gi, '')
    .replace(/\b(100% brand new|high quality|premium quality|original authentic)\b/gi, '')
    .replace(/\bno logo!?\b/gi, '')
    .replace(/\.{2,}/g, '')
    .replace(/\s*\|\s*/g, ' ')
    .replace(/\s*[-–—]{2,}\s*/g, ' ')
    .replace(/\bSpider\s+Man\b/gi, 'Spider-Man')
    .replace(/\b\d{3,4}#(?=\s|$)/g, '')
    .replace(/\b\d{4}\s+(?=[A-Z][a-z])/g, '')
    .replace(/\s+\d{4}#?$/g, '')
    .replace(/\b(?:christmas|birthday)\s+gifts?\b/gi, '')
    .replace(/\b(\d+)\s*pcs?\b/gi, '$1-Pack')
      .replace(/\b(\d+)\/(\d+)-Pack\/Set\b/gi, '$1/$2-Piece Set')
      .replace(/\b(\d+)-Pack\/Set\b/gi, '$1-Piece Set')
      .replace(/\b(\d+)\/(\d+)-Pack\b/gi, '$1/$2-Piece')
      .replace(/\b(\d+)-(\d+)-Pack\b/gi, '$1–$2-Piece')
      .replace(/\b1\s*set\b/gi, 'Set')
      .replace(/^(\d+V)\s+(?:(?:\d+(?:-Pack)?|Set)\s+){3,}/i, '$1 ')
      .replace(/\b(heated seat)\s+heating\b/gi, '$1')
    .replace(/(\d):\s+(\d)/g, '$1:$2')
    .replace(/:([A-Za-z])/g, ': $1')
    .replace(/\s+[–—-]\s*(sports|toys?|home|beauty|electronics)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

    value = value.replace(/\b([A-Za-z]{3,})\s+\1\b/gi, (match, word) =>
      word.toLowerCase() === 'doki' ? match : word,
    );

  const commaParts = value.split(',').map((part) => part.trim()).filter(Boolean);
  if (commaParts.length > 1 && commaParts[0].split(/\s+/).length >= 5) {
    value = commaParts.slice(0, 2).join(' – ');
  }

  const words = value.split(/\s+/).filter(Boolean);
  const wasTruncated = words.length > 12;
  if (wasTruncated) value = words.slice(0, 12).join(' ');
  if (wasTruncated) {
    value = value.replace(/\s+(with|for|and|or)\s+\S+$/i, '');
  }
  value = value
    .replace(/\b(for|with|and|or|the|a|an|of|to|from|in|on|by)$/i, '')
    .replace(/[,:;\-–—/]+$/g, '')
    .trim();
  value = titleCaseIfNeeded(value);
    if (value.length > 72) value = value.slice(0, 72).replace(/\s+\S*$/, '').trim();
  return value.length >= 8 ? value : `Everyday Product ${productId}`;
}

async function normalizeCategoryOrder() {
  const order = [
    'tech-accessories',
    'home-essentials',
    'personal-care-grooming',
    'desk-workspace',
    'sports-outdoors',
    'automotive-accessories',
    'pet-supplies',
    'home-garden',
    'toys-hobbies',
    'travel-everyday-carry',
    'printer-supplies',
  ];

  await prisma.$transaction(
    order.map((slug, index) =>
      prisma.category.updateMany({
        where: { slug },
        data: { sortOrder: (index + 1) * 10 },
      }),
    ),
  );
}

function isEligible(product) {
  if (!product.cost || product.cost <= 0 || !product.images.length) return false;
  return !blockedTerms.some((pattern) => pattern.test(product.name));
}

function sellingPrice(costPaise) {
  const roundedCost = Math.ceil(costPaise / 100) * 100;
  return roundedCost + 10_000;
}

async function api(path, token, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${path}: ${payload.message || JSON.stringify(payload)}`);
  }
  return payload.data || payload;
}

async function createToken() {
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', isActive: true },
    select: { id: true, email: true, role: true },
  });
  if (!admin) throw new Error('No active admin user is available.');
  return jwt.sign(
    { sub: admin.id, email: admin.email, role: admin.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '2h' },
  );
}

async function upsertCategory(plan) {
  return prisma.category.upsert({
    where: { slug: plan.slug },
    update: {
      name: plan.name,
      description: plan.description,
      isActive: true,
      sortOrder: plan.sortOrder,
    },
    create: {
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      isActive: true,
      sortOrder: plan.sortOrder,
    },
  });
}

async function newEligibleProducts(categoryId, baselineIds) {
  const products = await prisma.product.findMany({
    where: { categoryId, id: { notIn: [...baselineIds] } },
    include: { images: { select: { id: true, url: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return products.filter(isEligible);
}

async function importCategory(plan, category, token, baselineIds) {
  const job = await api('/suppliers/aliexpress/catalog/jobs', token, {
    method: 'POST',
    body: JSON.stringify({
      feedName: plan.feedName,
      country: plan.country,
      categoryId: category.id,
      perRunLimit: 50,
      currency: 'INR',
      enrich: false,
      mode: 'skip',
    }),
  });

  let eligible = [];
  for (let page = 0; page < 8 && eligible.length < TARGET_PER_CATEGORY; page += 1) {
    const state = await api(`/suppliers/aliexpress/catalog/jobs/${job.id}/advance`, token, {
      method: 'POST',
      body: '{}',
    });
    eligible = await newEligibleProducts(category.id, baselineIds);
    console.log(`[${plan.name}] page ${page + 1}: ${eligible.length} eligible new products`);
    if (state.status === 'COMPLETED' && eligible.length < TARGET_PER_CATEGORY) break;
  }
  if (eligible.length < TARGET_PER_CATEGORY) {
    throw new Error(`${plan.name} produced only ${eligible.length} eligible products.`);
  }
  return eligible.slice(0, TARGET_PER_CATEGORY);
}

async function curateProduct(product, plan) {
  const name = cleanProductName(product.name, product.supplierProductId || product.id);
  const shortDescription = `${name} for ${plan.benefit}.`;
  const description = `${name} is a practical choice for ${plan.benefit}. Check the product images and specifications to confirm compatibility, size and included accessories before ordering.`;
  const metadata = (() => {
    try {
      return { ...JSON.parse(product.metadata || '{}'), curatedBy: 'AUREVO', pricingRule: 'cost-plus-100-inr' };
    } catch {
      return { curatedBy: 'AUREVO', pricingRule: 'cost-plus-100-inr' };
    }
  })();

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: product.id },
      data: {
        name,
        shortDescription,
        description,
        basePrice: sellingPrice(product.cost),
        compareAtPrice: null,
        status: 'ACTIVE',
        isFeatured: false,
        metadata: JSON.stringify(metadata),
      },
    });
    await tx.productImage.updateMany({
      where: { productId: product.id },
      data: { alt: name },
    });
    const inventory = await tx.inventory.findFirst({
      where: { productId: product.id, variantId: null },
      select: { id: true },
    });
    if (inventory) {
      await tx.inventory.update({
        where: { id: inventory.id },
        data: { quantity: 0, reservedQuantity: 0, trackQuantity: false, allowBackorder: true },
      });
    } else {
      await tx.inventory.create({
        data: {
          productId: product.id,
          quantity: 0,
          reservedQuantity: 0,
          lowStockThreshold: 10,
          trackQuantity: false,
          allowBackorder: true,
          syncStatus: 'PENDING',
        },
      });
    }
  });
}

const categoryRules = [
  ['automotive-accessories', /\b(car|vehicle|automotive|motorcycle|audi|bmw|mercedes|toyota|volkswagen|vw|honda|nissan|ford|tesla|renault|peugeot|skoda|mitsubishi|pajero|bumper|headlight|fog light|windshield|dashboard|steering wheel|tire|tyre|obd|keyless|carburetor|rear view camera)\b/i],
  ['pet-supplies', /\b(pet|dog|cat|puppy|kitten|aquarium|fish tank|hamster|reptile|bird cage|pet collar|leash|pet bowl|shrimp tank)\b/i],
  ['toys-hobbies', /\b(toy|toys|doll|action figure|building blocks?|jigsaw|puzzle|rc car|remote control car|plush|children'?s game|kids'? game|baby rattle|model kit)\b/i],
  ['personal-care-grooming', /\b(shaver|razor|shaving|makeup|cosmetic|skincare|skin care|hair dryer|hair brush|hair clipper|nail|manicure|pedicure|grooming|perfume|facial|eyelash|eyebrow|toothbrush|beauty|serum|moisturizer)\b/i],
  ['sports-outdoors', /\b(fishing|fish lure|baitcast|bicycle|cycling|mountain bike|road bike|camping|hiking|trekking|workout|fitness|gym|yoga|sports?|helmet|golf|basketball|football|swimming|running|badminton|tennis|skateboard)\b/i],
  ['desk-workspace', /\b(desk|office|laptop stand|keyboard|mouse pad|mousepad|monitor stand|printer|office chair|stationery|notebook|document holder|webcam|conference microphone|computer speaker)\b/i],
  ['home-garden', /\b(garden|gardening|plant pot|planter|lawn|irrigation|greenhouse|soil|tree ruler|bird netting|garden hose|watering|outdoor light|patio)\b/i],
  ['home-essentials', /\b(kitchen|cooking|cookware|storage|cleaning|bathroom|bedroom|living room|pillow|mattress|curtain|apron|laundry|mop|vacuum|towel|whetstone|knife sharpener|household)\b/i],
  ['tech-accessories', /\b(usb|type-c|iphone|ipad|xiaomi|samsung|android|smartphone|phones?|telecommunications?|phone case|charger|charging|power bank|bluetooth|wi-?fi|earphone|headphone|camera|audio|speaker|microphone|adapter|cable|led video light|electronic|consumer electronics|raspberry pi|esp32)\b/i],
];

function classifyProduct(name, currentSlug) {
  if (/\b(rc car|remote control car|toy car|stunt car|car model|scale model|die[- ]?cast|lightsaber|action figure|doll clothes?|trading cards?|card sleeves?|pokemon cards?|mtg|ygo)\b/i.test(name)) return 'toys-hobbies';
  if (/\b(heated seat|seat heater|air shock strut|air suspension|shock strut)\b/i.test(name)) return 'automotive-accessories';
  if (/\b(earphones?|headphones?|earbuds?|loudspeakers?|audio speakers?|usb|type-c|phone case|power bank|bluetooth|wi-?fi)\b/i.test(name)) return 'tech-accessories';
  if (/\b(pen bags?|pencil cases?|pencil bags?)\b/i.test(name)) return 'desk-workspace';
  for (const [slug, pattern] of categoryRules) {
    if (pattern.test(name)) return slug;
  }
  return currentSlug;
}

async function reclassifyCuratedProducts() {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    select: { id: true, slug: true },
  });
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category.id]));
  const planBySlug = new Map(catalogPlan.map((plan) => [plan.slug, plan]));
  const products = await prisma.product.findMany({
    where: {
      status: 'ACTIVE',
      metadata: { contains: 'cost-plus-100-inr' },
    },
    include: {
      category: { select: { slug: true } },
      images: { select: { alt: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  for (let offset = 0; offset < products.length; offset += 25) {
    const batch = products.slice(offset, offset + 25).map((product) => {
      const name = cleanProductName(product.name, product.supplierProductId || product.id);
      let sourceCategory = '';
      try {
        sourceCategory = JSON.parse(product.metadata || '{}').sourceCategory || '';
      } catch {
        sourceCategory = '';
      }
      const targetSlug =
        classifyProduct(name, '') ||
        classifyProduct(sourceCategory, product.category.slug);
      const targetPlan = planBySlug.get(targetSlug) || planBySlug.get(product.category.slug);
      const benefit = targetPlan?.benefit || 'useful everyday tasks';
      const shortDescription = `${name} for ${benefit}.`;
      const description = `${name} is a practical choice for ${benefit}. Check the product images and specifications to confirm compatibility, size and included accessories before ordering.`;
      const categoryId = categoryBySlug.get(targetSlug) || product.categoryId;

      if (
        product.name === name &&
        product.categoryId === categoryId &&
        product.shortDescription === shortDescription &&
        product.description === description &&
        product.images.every((image) => image.alt === name)
      ) {
        return null;
      }

      return prisma.product.update({
        where: { id: product.id },
        data: {
          name,
          categoryId,
          shortDescription,
          description,
          images: { updateMany: { where: {}, data: { alt: name } } },
        },
      });
    }).filter(Boolean);
    if (batch.length > 0) await prisma.$transaction(batch);
    console.log(`[Catalog audit] checked ${Math.min(offset + 25, products.length)}/${products.length}`);
  }
}

async function main() {
  const baseline = await prisma.product.findMany({ select: { id: true } });
  const baselineIds = new Set(baseline.map((product) => product.id));
  const token = await createToken();
  const selected = [];

  if (process.env.AUDIT_ONLY !== '1') {
    for (const plan of catalogPlan) {
      const category = await upsertCategory(plan);
      const completedCount = await prisma.product.count({
        where: {
          categoryId: category.id,
          status: 'ACTIVE',
          metadata: { contains: 'cost-plus-100-inr' },
        },
      });
      if (completedCount >= TARGET_PER_CATEGORY) {
        console.log(`[${plan.name}] already complete (${completedCount} curated products)`);
        continue;
      }
      const products = await importCategory(plan, category, token, baselineIds);
      for (let index = 0; index < products.length; index += 1) {
        await curateProduct(products[index], plan);
        if ((index + 1) % 25 === 0) console.log(`[${plan.name}] curated ${index + 1}/${products.length}`);
      }
      selected.push(...products.map((product) => product.id));
    }
  }

  await reclassifyCuratedProducts();
  await normalizeCategoryOrder();

  // Supplier stock is unknown until a successful AliExpress detail sync.
  // Keep those rows untracked instead of exposing a fictional quantity of 100.
  await prisma.inventory.updateMany({
    where: {
      product: {
        supplierId: { not: null },
        status: 'ACTIVE',
      },
      trackQuantity: true,
      OR: [
        { syncStatus: null },
        { syncStatus: { not: 'SUCCESS' } },
      ],
    },
    data: {
      quantity: 0,
      reservedQuantity: 0,
      trackQuantity: false,
      allowBackorder: true,
      supplierStock: null,
      lastSyncedAt: null,
      syncStatus: 'PENDING',
    },
  });

  await prisma.product.updateMany({
    where: {
      id: { notIn: [...baselineIds, ...selected] },
      supplierId: { not: null },
      status: 'DRAFT',
    },
    data: { status: 'ARCHIVED' },
  });

  const totalActive = await prisma.product.count({ where: { status: 'ACTIVE' } });
  const addedActive = await prisma.product.count({
    where: { id: { in: selected }, status: 'ACTIVE' },
  });
  const [curatedProducts, activeCategories, supplierInventoryViolations] = await Promise.all([
    prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        metadata: { contains: 'cost-plus-100-inr' },
      },
      select: {
        id: true,
        name: true,
        cost: true,
        basePrice: true,
        inventory: { select: { trackQuantity: true, syncStatus: true } },
      },
    }),
    prisma.category.count({ where: { isActive: true } }),
    prisma.inventory.count({
      where: {
        product: { supplierId: { not: null }, status: 'ACTIVE' },
        trackQuantity: true,
        OR: [
          { syncStatus: null },
          { syncStatus: { not: 'SUCCESS' } },
        ],
      },
    }),
  ]);
  const pricingViolations = curatedProducts.filter(
    (product) => !product.cost || product.basePrice !== sellingPrice(product.cost),
  );
  const titleViolations = curatedProducts.filter(
    (product) => product.name.length > 72 || product.name.length < 8,
  );
  const unverifiedTrackingViolations = curatedProducts.filter((product) =>
    product.inventory.some(
      (row) => row.syncStatus !== 'SUCCESS' && row.trackQuantity,
    ),
  );
  const expectedCurated = catalogPlan.length * TARGET_PER_CATEGORY;

  if (curatedProducts.length !== expectedCurated) {
    throw new Error(`Catalog integrity failed: expected ${expectedCurated} curated active products, found ${curatedProducts.length}`);
  }
  if (pricingViolations.length > 0) {
    throw new Error(`Catalog integrity failed: ${pricingViolations.length} curated products violate the cost-plus-₹100 rule`);
  }
  if (titleViolations.length > 0) {
    throw new Error(`Catalog integrity failed: ${titleViolations.length} curated products have invalid title lengths`);
  }
  if (unverifiedTrackingViolations.length > 0) {
    throw new Error(`Catalog integrity failed: ${unverifiedTrackingViolations.length} products claim tracked stock without a successful supplier sync`);
  }
  if (supplierInventoryViolations > 0) {
    throw new Error(`Catalog integrity failed: ${supplierInventoryViolations} active supplier products claim tracked stock without a successful supplier sync`);
  }

  console.log(JSON.stringify({
    addedActive,
    totalActive,
    curatedActive: curatedProducts.length,
    activeCategories,
    pricingViolations: pricingViolations.length,
    titleViolations: titleViolations.length,
    unverifiedTrackingViolations: unverifiedTrackingViolations.length,
    supplierInventoryViolations,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
