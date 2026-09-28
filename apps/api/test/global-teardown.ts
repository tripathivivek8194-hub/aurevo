import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * Removes the isolated E2E database after the suite finishes so a stale file
 * never leaks into the next run (or version control).
 */
export default function globalTeardown(): void {
  const dbFile = path.resolve(__dirname, '..', 'prisma', 'test-e2e.db');

  for (const suffix of ['', '-journal']) {
    const file = dbFile + suffix;
    if (fs.existsSync(file)) {
      fs.rmSync(file, { force: true });
    }
  }
}