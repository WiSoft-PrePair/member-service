import { NestFactory } from "@nestjs/core";
import { AppModule } from "@/app.module";
import { MikroORM } from "@mikro-orm/core";
import { ValidationPipe } from "@nestjs/common";
import { HttpExceptionFilter } from "@/adapter/shared/api/filters/http-exception.filter";
import { LOGGER } from "@/adapter/shared/logger/logger.inferface";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const logger = app.get(LOGGER);

  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  // 로깅 기능이 추가된 HttpExceptionFilter 사용
  app.useGlobalFilters(new HttpExceptionFilter(logger));

  const orm = app.get(MikroORM);
  await orm.schema.updateSchema({ safe: true });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
