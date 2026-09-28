"use strict";
function neutralizeSupplierSecrets() {
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
//# sourceMappingURL=setup-env.js.map