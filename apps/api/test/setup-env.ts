/**
 * Hermetic environment for the E2E suite.
 *
 * Runs in each Jest worker BEFORE the spec file is imported, so these value
 * set on `process.env` win over `apps/api/.env` (dotenv never overrides
 * already-set env vars) and the app boots against the isolated test database.
 *
 * `NODE_ENV=test` satisfies `validateEnv` without demanding the
 * production-only vars, and the fixed >=32-char secrets pass its
 * "cryptographically random" check for non-development environments.
 *
 * Supplier credentials: the real `CJ_API_KEY` / `ALIEXPRESS_*` secrets from
 * `.env` must never reach the test process, or the "honest NOT_CONFIGURED"
 * assertions become false on a machine that owns the real credentials (CJ
 * config is env-driven, so a live key flips status to DISCONNECTED and calls
 * the real adapter). Pin `test_`-prefixed placeholders — `isPlaceholder()`
 * rejects them, so configure()/status/verify/advance all degrade to the
 * unconfigured path without touching the network.
 */
function neutralizeSupplierSecrets(): void {
  const placeholder = 'test_placeholder_e2e_not_a_real_credential';
  for (const key of [
    'CJ_API_KEY',
    'CJ_APP_SECRET',
    'CJ_APP_KEY',
    'ALIEXPRESS_APP_KEY',
    'ALIEXPRESS_APP_SECRET',
    'ALIEXPRESS_ACCESS_TOKEN',
  ]) {
    process.env[key] = placeholder;
  }
}
neutralizeSupplierSecrets();

/**
 * Email: never reach the real Resend API in tests. `.env` ships a placeholder
 * key that would otherwise trigger a live (401) network call on every
 * registration/reset. Pin it to empty so EmailService falls into no-op mode.
 */
process.env.EMAIL_API_KEY = '';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test-e2e.db';
process.env.WEB_URL = 'http://localhost:3000';
process.env.PORT = '4001';
process.env.ADMIN_EMAIL = 'admin@aurevo.test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789abcdef';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789abcdef';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '30d';