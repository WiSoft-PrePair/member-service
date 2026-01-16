export interface LogContext {
  module?: string;
  correlationId?: string;
  [key: string]: any;
}

export interface ErrorLog {
  type: string;
  message: string;
  stack?: string;
}

export interface ILogger {
  log(message: string, context?: LogContext): void;

  error(message: string, error?: Error, context?: LogContext): void;

  warn(message: string, context?: LogContext): void;

  debug(message: string, context?: LogContext): void;
}

export const LOGGER = Symbol("LOGGER");
