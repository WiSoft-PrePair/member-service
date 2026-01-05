import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Response } from "express";
import { SuccessResponse } from "@/adapter/shared/api/types/api-response.type";
import { map, Observable } from "rxjs";

@Injectable()
export class TransformResponseInterceptor<T>
  implements NestInterceptor<T, SuccessResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessResponse<T>> {
    const response: Response = context.switchToHttp().getResponse<Response>();
    const statusCode: number = response.statusCode;

    return next.handle().pipe(
      map((data: T) => ({
        statusCode,
        data,
        message: this.getSuccessMessage(statusCode),
      })),
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
