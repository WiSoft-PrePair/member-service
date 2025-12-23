import { NestFactory } from "@nestjs/core";
import { AppModule } from "@/app.module";
import { MikroORM } from "@mikro-orm/core";
import { ValidationPipe } from "@nestjs/common";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  const orm = app.get(MikroORM);
  await orm.schema.updateSchema({ safe: true });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
