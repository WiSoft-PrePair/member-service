import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";
import { DomainException } from "@/domain/shared/exception/domain.exception";
import { ErrorResponse } from "@/adapter/shared/api/types/api-response.type";
import { HttpExceptionWithCode } from "@/adapter/shared/api/exceptions/http.exception";

interface HttpExceptionResponse {
  message: string | string[];
  error?: string;
  statusCode?: number;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const errorResponse = this.buildErrorResponse(exception);

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  private buildErrorResponse(exception: unknown): ErrorResponse {
    // 1. errorCode가 있는 커스텀 HTTP 예외
    if (exception instanceof HttpExceptionWithCode) {
      return {
        statusCode: exception.getStatus(),
        error: {
          code: exception.errorCode,
          message: exception.message,
        },
      };
    }

    // 2. 도메인 예외 -> BadRequest로 매핑
    if (exception instanceof DomainException) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: {
          code: exception.errorCode,
          message: exception.message,
        },
      };
    }

    // 3. NestJS 기본 HTTP 예외
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      // 타입 가드: string 응답
      if (typeof response === "string") {
        return {
          statusCode: status,
          error: {
            code: this.getErrorCodeFromStatus(status),
            message: response,
          },
        };
      }

      // 타입 가드: object 응답
      const exceptionResponse = response as HttpExceptionResponse;

      // Validation 에러 처리 (class-validator)
      if (Array.isArray(exceptionResponse.message)) {
        return {
          statusCode: status,
          error: {
            code: "VALIDATION_ERROR",
            message: exceptionResponse.message.join(", "),
          },
        };
      }

      return {
        statusCode: status,
        error: {
          code: this.getErrorCodeFromStatus(status),
          message: exceptionResponse.message || exception.message,
        },
      };
    }

    // 4. 알 수 없는 예외 -> Internal Server Error
    console.error("Unhandled exception:", exception);
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "내부 서버 오류가 발생했습니다",
      },
    };
  }

  private getErrorCodeFromStatus(status: HttpStatus): string {
    const codeMap: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: "BAD_REQUEST",
      [HttpStatus.UNAUTHORIZED]: "UNAUTHORIZED",
      [HttpStatus.FORBIDDEN]: "FORBIDDEN",
      [HttpStatus.NOT_FOUND]: "NOT_FOUND",
      [HttpStatus.CONFLICT]: "CONFLICT",
      [HttpStatus.UNPROCESSABLE_ENTITY]: "UNPROCESSABLE_ENTITY",
      [HttpStatus.INTERNAL_SERVER_ERROR]: "INTERNAL_SERVER_ERROR",
    };

    return codeMap[status] || "UNKNOWN_ERROR";
  }
}
