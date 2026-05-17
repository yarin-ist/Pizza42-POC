import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Global exception filter — catches every unhandled exception in the NestJS
 * application and converts it into a consistent JSON error response.
 *
 * WITHOUT this filter, NestJS has two behaviours:
 *   - HttpException subclasses (ForbiddenException, UnauthorizedException, …)
 *     → formatted as { statusCode, message } by the built-in handler.
 *   - Plain Error / unexpected throws → 500 with a generic "Internal server error"
 *     message, but the original error detail is silently swallowed.
 *
 * WITH this filter:
 *   - All errors produce a uniform { statusCode, message, path, timestamp } shape.
 *   - Every error is logged via NestJS's Logger (visible in the dev terminal and
 *     capturable by any centralized logging service like Datadog or CloudWatch).
 *   - Stack traces are logged for unexpected (non-HTTP) errors, not exposed to clients.
 *
 * Security note: stack traces and internal error details are intentionally kept
 * out of the HTTP response. They are only written to the server-side log.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Determine HTTP status: use the exception's own status if it is an
    // HttpException, otherwise default to 500 Internal Server Error.
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Extract a clean message to send to the client.
    // For HttpException, use the exception message (already safe to expose).
    // For unexpected errors, return a generic message — never leak internals.
    const clientMessage =
      exception instanceof HttpException
        ? exception.message
        : 'An unexpected error occurred. Please try again later.';

    // Log with appropriate severity:
    //   - 4xx (client errors, e.g. 401/403) → warn: expected, not server's fault
    //   - 5xx (server errors) → error: needs investigation
    const logLine = `[${request.method}] ${request.url} → ${status}`;
    if (status >= 500) {
      this.logger.error(
        logLine,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${logLine}: ${clientMessage}`);
    }

    response.status(status).json({
      statusCode: status,
      message: clientMessage,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
