import {
  Module,
  OnApplicationShutdown,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { MikroOrmCoreModule } from "@mikro-orm/nestjs/mikro-orm-core.module";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { MemberEntity } from "@/adapter/member/persistence/mikro-orm/entity/member.entity";
import { MikroORM } from "@mikro-orm/core";

@Module({
  imports: [
    MikroOrmCoreModule.forRoot({
      driver: PostgreSqlDriver,
      host: "dbclass.wisoft.io",
      port: 10008,
      user: "dongmin",
      password: "slow1234!@",
      dbName: "dongmin",
      debug: false,
      autoLoadEntities: true,
    }),
    MikroOrmModule.forFeature([MemberEntity]),
  ],
})
export class DatabaseModule
  implements OnModuleInit, OnModuleDestroy, OnApplicationShutdown
{
  constructor(private readonly orm: MikroORM) {}
  async onApplicationShutdown(signal?: string) {
    console.log(`App shutting down with signal: ${signal}`);
    await this.orm.close();
  }
  async onModuleDestroy() {
    await this.orm.close();
  }
  async onModuleInit() {
    await this.orm.schema.ensureDatabase();
  }
}
