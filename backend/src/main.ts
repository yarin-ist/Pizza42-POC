import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Use NestJS's built-in logger for all framework-level messages
    // (module init, route registration, etc.)
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const logger = new Logger('Bootstrap');

  // ─── CORS ──────────────────────────────────────────────────────────────────
  // Strict allowlist: only the Angular dev server (or the Vercel production
  // domain set via CORS_ORIGIN env var in Phase 5) may include cross-origin
  // Authorization headers.
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:4200',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });

  // ─── Global Exception Filter ───────────────────────────────────────────────
  // Converts ALL uncaught exceptions (HttpException subclasses and plain Errors)
  // into a uniform { statusCode, message, path, timestamp } JSON response.
  // 4xx errors are logged as warnings, 5xx as errors with full stack traces.
  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new GlobalExceptionFilter());

  // ─── HTTP Request Logger ───────────────────────────────────────────────────
  // Logs every incoming request and its response status/duration.
  // Output format:  POST /orders  201  142ms
  // Useful during the live demo: the terminal makes the token validation chain
  // visible in real time (401 for bad token, 403 for missing scope, 201 for success).
  app.use((req: any, res: any, next: () => void) => {
    const requestLogger = new Logger('HTTP');
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const status: number = res.statusCode;
      const logFn = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'log';
      requestLogger[logFn](
        `${req.method} ${req.url}  ${status}  ${duration}ms`,
      );
    });
    next();
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Pizza 42 API listening on port ${port}`);
  logger.log(`CORS origin: ${process.env.CORS_ORIGIN ?? 'http://localhost:4200'}`);
}
bootstrap();
