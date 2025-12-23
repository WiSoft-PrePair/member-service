import { Module, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MikroOrmCoreModule } from "@mikro-orm/nestjs/mikro-orm-core.module";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { mikroOrmConfig } from "@/config/database.config";
import { MikroORM } from "@mikro-orm/core";
import { Env } from "@/config";

@Module({
  imports: [
    MikroOrmCoreModule.forRootAsync({
      useFactory: (configService: ConfigService<Env, true>) =>
        mikroOrmConfig(configService),
      inject: [ConfigService],
    }),
    MikroOrmModule.forFeature([]),
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
