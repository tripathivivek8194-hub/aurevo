import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * Builds the isolated E2E database from the same versioned migrations used in
 * dev/prod, so the test schema is guaranteed to match the real one.
 *
 * Runs once, in its own Jest process. Prisma resolves a SQLite `file:` URL
 * relative to the schema directory (`apps/api/prisma/`), so the DB lands at
 * `apps/api/prisma/test-e2e.db`. A stale file is deleted first so `migrate
 * deploy` starts from a clean slate on every run.
 */
const TEST_DB_URL = 'file:./test-e2e.db';

export default function globalSetup(): void {
  const apiRoot = path.resolve(__dirname, '..');
  const schemaDir = path.join(apiRoot, 'prisma');
  const dbFile = path.join(schemaDir, 'test-e2e.db');

  for (const suffix of ['', '-journal']) {
    const file = dbFile + suffix;
    if (fs.existsSync(file)) {
      fs.rmSync(file, { force: true });
    }
  }

  execSync('npx prisma migrate deploy', {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL, NODE_ENV: 'test' },
    stdio: 'inherit',
  });
}