import { NestFactory } from "@nestjs/core";
import { AppModule } from "@/app.module";
import { MikroORM } from "@mikro-orm/core";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const orm = app.get(MikroORM);
  await orm.schema.updateSchema({ safe: true });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
