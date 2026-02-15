import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { Observable } from "rxjs";

@Injectable()
export class ApiPrepairGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request: Request = context.switchToHttp().getRequest<Request>();
    const apiKey: string | string[] | undefined =
      request.headers["x-api-prepair"];

    if (!apiKey) {
      throw new UnauthorizedException("API key is required");
    }

    const validApiKey: string =
      this.configService.getOrThrow<string>("INTERNAL_API_KEY");

    if (apiKey !== validApiKey) {
      throw new UnauthorizedException("Invalid API key");
    }

    return true;
  }
}
