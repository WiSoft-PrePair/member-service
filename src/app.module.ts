import { MikroOrmModule } from "@mikro-orm/nestjs";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { AppController } from "@/app.controller";
import { EventStoreModule } from "@/bounded-context/member/adapter/out/persistence/event-store/event-store.module";
import { Env, loadEnv } from "@/config/env.config";
import { SharedKernelModule } from "@/shared-kernel/shared-kernel.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: loadEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get("LOG_LEVEL", { infer: true }),
          transport:
            config.get("NODE_ENV", { infer: true }) === "development"
              ? { target: "pino-pretty" }
              : undefined,
        },
      }),
    }),
    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        driver: PostgreSqlDriver,
        clientUrl: config.get("DATABASE_URL", { infer: true }),
        entities: ["./dist/**/*.entity.js"],
        entitiesTs: ["./src/**/*.entity.ts"],
        debug: config.get("NODE_ENV", { infer: true }) === "development",
        discovery: { warnWhenNoEntities: false },
      }),
    }),
    SharedKernelModule,
    EventStoreModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
