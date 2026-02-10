import { Module, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";
import { mikroOrmConfig } from "@/config/database.config";
import { MikroORM } from "@mikro-orm/core";
import { Env } from "@/config";

@Module({
  imports: [
    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      useFactory: (configService: ConfigService<Env, true>) =>
        mikroOrmConfig(configService),
      inject: [ConfigService],
    }),
  ],
})
export class PersistenceModule implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly orm: MikroORM) {}

  async onModuleDestroy(): Promise<void> {
    await this.orm.close();
  }

  async onModuleInit(): Promise<void> {
    await this.orm.schema.ensureDatabase();
  }
}
