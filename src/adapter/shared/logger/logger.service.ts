import { Injectable } from "@nestjs/common";
import {
  ErrorLog,
  ILogger,
  LogContext,
} from "@/adapter/shared/logger/logger.inferface";
import { PinoLogger } from "nestjs-pino";

@Injectable()
export class LoggerService implements ILogger {
  constructor(private readonly logger: PinoLogger) {}

  log(message: string, context?: LogContext): void {
    this.logger.info(this.formatContext(context), message);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    const errorLog = error ? this.formatError(error) : undefined;

    this.logger.error(
      {
        ...this.formatContext(context),
        error: errorLog,
      },
      message,
    );
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(this.formatContext(context), message);
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(this.formatContext(context), message);
  }

  private formatContext(context?: LogContext): Record<string, any> {
    if (!context) return {};

    const { module, correlationId, ...rest } = context;

    return {
      ...(module && { module }),
      ...(correlationId && { correlationId }),
      ...rest,
    };
  }

  private formatError(error: Error): ErrorLog {
    return {
      type: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
}
