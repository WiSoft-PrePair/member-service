import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Request, Response } from "express";

export const CORRELATION_ID_HEADER = "x-correlation-id";
export const CORRELATION_ID_KEY = "correlationId";

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: (error?: any) => void) {
    const correlationId =
      (req.headers[CORRELATION_ID_HEADER] as string) || randomUUID();

    req[CORRELATION_ID_KEY] = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    next();
  }
}
