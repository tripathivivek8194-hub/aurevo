import { Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { createApp } from './create-app';
import { shouldExposeApiDocs } from './config/swagger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await createApp();

  // Swagger documentation — exposed ONLY outside production so the full admin
  // surface (and its saved bearer credentials) is never reachable publicly.
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (shouldExposeApiDocs(nodeEnv)) {
    const config = new DocumentBuilder()
      .setTitle('AUREVO API')
      .setDescription('AUREVO Ecommerce API Documentation')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token'
      )
      .addCookieAuth('refresh_token')
      .addTag('auth', 'Authentication endpoints')
      .addTag('users', 'User management')
      .addTag('products', 'Product catalog')
      .addTag('categories', 'Product categories')
      .addTag('cart', 'Shopping cart')
      .addTag('checkout', 'Checkout flow')
      .addTag('orders', 'Order management')
      .addTag('payments', 'Payment processing')
      .addTag('suppliers', 'Supplier integration')
      .addTag('admin', 'Admin endpoints')
      .addTag('health', 'Health & readiness checks')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        // Never persist bearer tokens across browser sessions — keeps admin
        // credentials out of localStorage even in non-prod environments.
        persistAuthorization: false,
      },
    });
  }

  const port = process.env.PORT || 4000;
  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 AUREVO API running on http://localhost:${port}/api`);
  if (nodeEnv !== 'production') {
    logger.log(`📚 API Documentation: http://localhost:${port}/docs`);
  }
}

bootstrap();
