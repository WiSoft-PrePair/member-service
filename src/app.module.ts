import { MikroOrmModule } from "@mikro-orm/nestjs";
import { defineConfig, PostgreSqlDriver } from "@mikro-orm/postgresql";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { CqrsModule } from "@nestjs/cqrs";
import { ScheduleModule } from "@nestjs/schedule";
import { LoggerModule } from "nestjs-pino";
import { AppController } from "@/app.controller";
import { type Env, loadEnv } from "@/config/env.config";
import { EffectRuntimeModule } from "@/infrastructure/effect/effect-runtime.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: loadEnv }),
    ...(process.env.NODE_ENV !== "development" ? [LoggerModule.forRoot()] : []),
    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        defineConfig({
          driver: PostgreSqlDriver,
          clientUrl: config.get("DATABASE_URL", { infer: true }),
          entities: ["./dist/**/*.entity.js"],
          entitiesTs: ["./src/**/*.entity.ts"],
          migrations: {
            path: "./dist/mikro/migrations",
            pathTs: "./mikro/migrations",
          },
          discovery: { warnWhenNoEntities: false },
          debug: config.get("NODE_ENV", { infer: true }) === "development",
        }),
    }),
    CqrsModule.forRoot(),
    ScheduleModule.forRoot(),
    EffectRuntimeModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
