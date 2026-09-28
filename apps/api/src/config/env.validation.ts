/**
 * Environment variable validation for the AUREVO API.
 *
 * Runs once at ConfigModule boot via the `validate` hook, so a misconfigured
 * deployment fails fast at startup instead of failing mid-request or shipping
 * with placeholder secrets. Development allows partial config; production is
 * strict.
 */

const REQUIRED_ALWAYS = ['NODE_ENV', 'DATABASE_URL', 'WEB_URL', 'ADMIN_EMAIL'];

// Only enforced when NODE_ENV === 'production'.
const REQUIRED_PRODUCTION = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  // Without a strong ENCRYPTION_KEY the suppliers AES-256-GCM config falls back
  // to a hard-coded development key, silently weakening at-rest encryption.
  'ENCRYPTION_KEY',
  // TEMP-DEPLOY-AHEAD-OF-RAZORPAY: Razorpay trio is optional when empty
  // (payments gracefully disabled). If provided, strict live-key format applies.
  // 'RAZORPAY_KEY_ID',
  // 'RAZORPAY_KEY_SECRET',
  // 'RAZORPAY_WEBHOOK_SECRET',
];

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const env = (config.NODE_ENV as string) || 'development';
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const key of REQUIRED_ALWAYS) {
    if (!config[key]) {
      errors.push(`Missing required env var: ${key}`);
    }
  }

  if (env === 'production') {
    for (const key of REQUIRED_PRODUCTION) {
      if (!config[key]) {
        errors.push(`Missing required env var in production: ${key}`);
      }
    }
  }

  // Reject placeholder secrets outside development — a predictable JWT secret
  // would let an attacker forge auth tokens, and a known ENCRYPTION_KEY would
  // let them decrypt stored supplier credentials.
  if (env !== 'development') {
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY']) {
      const value = config[key] as string | undefined;
      if (
        value &&
        (value.startsWith('change-me') ||
          value === 'default-key-change-in-production' ||
          value.length < 32)
      ) {
        errors.push(`${key} must be a cryptographically random string (>= 32 chars)`);
      }
    }

  }

  // TEMP-DEPLOY-AHEAD-OF-RAZORPAY: Razorpay trio carve-out.
  // If RAZORPAY_KEY_ID is empty/falsy in production, allow boot with a
  // prominent warning (payments disabled until keys are provided). If set,
  // enforce strict live-key format: ^rzp_live_[A-Za-z0-9]{10,}$
  // Test keys (rzp_test_) and placeholders are still rejected.
  if (env === 'production') {
    const razorpayKeyId = (config.RAZORPAY_KEY_ID as string | undefined) ?? '';
    const razorpayKeySecret = (config.RAZORPAY_KEY_SECRET as string | undefined) ?? '';
    const razorpayWebhookSecret = (config.RAZORPAY_WEBHOOK_SECRET as string | undefined) ?? '';

    const razorpayEmpty = !razorpayKeyId && !razorpayKeySecret && !razorpayWebhookSecret;
    const razorpayAllSet = razorpayKeyId && razorpayKeySecret && razorpayWebhookSecret;

    if (razorpayEmpty) {
      warnings.push('RAZORPAY live keys not configured — payments disabled until .env is completed');
    } else if (razorpayAllSet) {
      // All three provided: enforce strict production validation
      if (razorpayKeyId.startsWith('rzp_test_') || razorpayKeyId.includes('your_')) {
        errors.push(
          'RAZORPAY_KEY_ID must be a live (rzp_live_...) key in production — test-mode keys and placeholders are rejected',
        );
      }
      // Strict live-key format: rzp_live_ followed by 10+ alphanumeric chars
      if (!/^rzp_live_[A-Za-z0-9]{10,}$/.test(razorpayKeyId)) {
        errors.push('RAZORPAY_KEY_ID must match ^rzp_live_[A-Za-z0-9]{10,}$ (live key format)');
      }
      for (const key of ['RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET']) {
        const value = (config[key] as string | undefined) ?? '';
        if (value.includes('your_') || value.includes('placeholder')) {
          errors.push(`${key} must be a real production value, not a placeholder`);
        }
      }
    } else {
      // Partial Razorpay config — reject explicitly (must be all or nothing)
      errors.push(
        'RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and RAZORPAY_WEBHOOK_SECRET must be either all set (live keys) or all empty — partial config is not allowed',
      );
    }
  }

  // Log warnings at startup so they're visible in container logs
  if (warnings.length > 0) {
    // Use console.warn here since Logger isn't available at this early stage
    // TEMP-DEPLOY-AHEAD-OF-RAZORPAY: intentional console.warn for visibility
    console.warn('[ENV-WARN]', warnings.join('; '));
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n - ${errors.join('\n - ')}`);
  }

  return config;
}