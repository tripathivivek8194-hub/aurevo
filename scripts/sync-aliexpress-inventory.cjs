const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();

async function main() {
  const limit = Math.max(1, Math.min(Number(process.env.SYNC_LIMIT || 5), 10));
  const dryRun = process.env.APPLY_INVENTORY !== '1';
  const cursor = process.env.SYNC_CURSOR || undefined;
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', isActive: true },
    select: { id: true, email: true, role: true },
  });
  if (!admin) throw new Error('No active admin account is available');

  const token = jwt.sign(
    { sub: admin.id, email: admin.email, role: admin.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '10m' },
  );
  const response = await fetch('http://127.0.0.1:4000/api/suppliers/aliexpress/inventory/sync', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ limit, dryRun, cursor }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${payload.message || JSON.stringify(payload)}`);
  console.log(JSON.stringify(payload.data ?? payload, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
