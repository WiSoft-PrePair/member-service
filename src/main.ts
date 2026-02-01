import { NestFactory } from "@nestjs/core";
import { AppModule } from "@/app.module";
import { MikroORM } from "@mikro-orm/core";
import { INestApplication, Logger, ValidationPipe } from "@nestjs/common";
import { HttpExceptionFilter } from "@/adapter/shared/api/filters/http-exception.filter";
import { LOGGER } from "@/adapter/shared/logger/logger.inferface";
import { ConfigService } from "@nestjs/config";
import type { Env } from "@/config/env.config";

async function bootstrap() {
  const app: INestApplication = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const logger: Logger = app.get(LOGGER);
  const configService: ConfigService = app.get(ConfigService<Env, true>);

  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  // 로깅 기능이 추가된 HttpExceptionFilter 사용
  app.useGlobalFilters(new HttpExceptionFilter(logger));

  const orm: MikroORM = app.get(MikroORM);
  await orm.schema.updateSchema({ safe: true });

  const port: number = configService.get("PORT") as number;
  await app.listen(port);

  logger.log(`NestJS Application is running on port ${port}`);
}

bootstrap();
