import { ConfigService } from "@nestjs/config";
import { MikroOrmModuleOptions } from "@mikro-orm/nestjs";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";
import { Env } from "./env.config";
import { MemberEntity } from "@/adapter/member/persistence/mikro-orm/entity";
import { EventStoreEntity } from "@/adapter/shared/event-store";
import { MemberReadEntity } from "@/adapter/member/persistence/read";

export const mikroOrmConfig = (
  configService: ConfigService<Env, true>,
): MikroOrmModuleOptions => ({
  driver: PostgreSqlDriver,
  host: configService.get("POSTGRES_HOST"),
  port: configService.get("POSTGRES_PORT"),
  user: configService.get("POSTGRES_USER"),
  password: configService.get("POSTGRES_PASSWORD"),
  dbName: configService.get("POSTGRES_DB"),
  // debug: configService.get("NODE_ENV") === "dev",
  debug: false,
  autoLoadEntities: true,
  entities: [MemberEntity, EventStoreEntity, MemberReadEntity],
  registerRequestContext: true,
});
