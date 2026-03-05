import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Response } from "express";
import { SuccessResponse } from "@/adapter/shared/api/types/api-response.type";
import { map, Observable } from "rxjs";
import { SKIP_TRANSFORM_KEY } from "@/adapter/shared/api/decorators/skip-transform.decorator";

@Injectable()
export class TransformResponseInterceptor<T> implements NestInterceptor<
  T,
  SuccessResponse<T>
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessResponse<T>> {
    // SSE 등 변환을 건너뛰어야 하는 엔드포인트 처리
    const skip = this.reflector.get<boolean>(
      SKIP_TRANSFORM_KEY,
      context.getHandler(),
    );
    if (skip) {
      return next.handle() as unknown as Observable<SuccessResponse<T>>;
    }

    const response: Response = context.switchToHttp().getResponse<Response>();
    const statusCode: number = response.statusCode;

    return next.handle().pipe(
      map((data: any) => {
        const customMessage = data?.message;
        const finalMessage =
          customMessage || this.getSuccessMessage(statusCode);

        if (data && typeof data === "object" && "message" in data) {
          const { message: _, ...rest } = data;
          return {
            statusCode,
            data: rest,
            message: finalMessage,
          };
        }

        return {
          statusCode,
          data,
          message: finalMessage,
        };
      }),
    );
  }

  private getSuccessMessage(StatusCode: number): string {
    switch (StatusCode) {
      case 200:
        return "요청이 성공적으로 처리되었습니다";
      case 201:
        return "리소스가 성공적으로 생성되었습니다";
      case 204:
        return "요청이 성공적으로 처리되었습니다";
      default:
        return "성공";
    }
  }
}
