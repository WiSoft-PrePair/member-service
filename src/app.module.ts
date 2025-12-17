import { Module } from "@nestjs/common";
import { MikroOrmCoreModule } from "@mikro-orm/nestjs/mikro-orm-core.module";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { MemberModule } from "@/adapter/member/member.module";
import { MemberEntity } from "@/adapter/member/persistence/mikro-orm/entity/member.entity";

@Module({
  imports: [
    MikroOrmCoreModule.forRoot({
      driver: PostgreSqlDriver,
      host: "dbclass.wisoft.io",
      port: 10008,
      user: "dongmin",
      password: "slow1234!@",
      dbName: "dongmin",
      debug: process.env.NODE_ENV !== "production",
      autoLoadEntities: true,
    }),
    MikroOrmModule.forFeature([MemberEntity]),
    MemberModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
