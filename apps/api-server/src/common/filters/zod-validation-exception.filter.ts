import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import { ErrorCode, ErrorResponse } from './error-codes';

@Catch(ZodValidationException)
export class ZodValidationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ZodValidationExceptionFilter.name);

  catch(exception: ZodValidationException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const errorResponse: ErrorResponse = {
      statusCode: HttpStatus.BAD_REQUEST,
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Validation failed',
      details: this.formatZodErrors(exception),
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    this.logger.debug(
      `Validation failed: [${request.method}] ${request.url}`,
      errorResponse.details
    );

    response.status(errorResponse.statusCode).send(errorResponse);
  }

  private formatZodErrors(exception: ZodValidationException) {
    const zodError = exception.getZodError();
    if (zodError instanceof ZodError) {
      return zodError.issues.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code,
      }));
    }
    return [{ field: '', message: 'Validation failed', code: 'unknown' }];
  }
}
