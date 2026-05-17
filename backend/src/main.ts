import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Strict CORS: only the Angular dev server is allowed.
  // In Phase 5 (deployment) CORS_ORIGIN is set to the Vercel production domain.
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:4200',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
