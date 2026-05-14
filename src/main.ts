import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "@/app.module";
import type { Env } from "@/config/env.config";

async function bootstrap(): Promise<void> {
  const isDev: boolean = process.env.NODE_ENV === "development";

  const app: INestApplication<unknown> = await NestFactory.create(AppModule, {
    bufferLogs: !isDev,
  });

  if (!isDev) {
    app.useLogger(app.get(Logger));
  }

  const config = app.get(ConfigService<Env, true>);
  await app.listen(config.get("PORT", { infer: true }));
}

void bootstrap();
