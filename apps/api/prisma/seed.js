"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcrypt"));
const prisma = new client_1.PrismaClient();
const CATEGORIES = [
    { name: 'Men', slug: 'men' },
    { name: 'Women', slug: 'women' },
    { name: 'Accessories', slug: 'accessories' },
    { name: 'Footwear', slug: 'footwear' },
    { name: 'Home & Living', slug: 'home-living' },
];
async function main() {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Seeding is disabled in production');
    }
    for (const category of CATEGORIES) {
        await prisma.category.upsert({
            where: { slug: category.slug },
            update: {},
            create: category,
        });
    }
    console.log(`Seeded ${CATEGORIES.length} categories`);
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
        const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
        if (!existing) {
            const passwordHash = await bcrypt.hash('admin12345', 12);
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
            console.log(`Created admin user ${adminEmail} (password: admin12345)`);
        }
    }
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
//# sourceMappingURL=seed.js.map