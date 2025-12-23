import { Module } from "@nestjs/common";
import { MemberModule } from "@/adapter/member/member.module";
import { PersistenceModule } from "@/adapter/member/persistence/persistence.module";
import { ConfigModule } from "@nestjs/config";
import { envSchema } from "@/config/env.config";
import { MemberController } from "@/adapter/member/api/member.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, any>) => envSchema.parse(config),
    }),
    PersistenceModule,
    MemberModule,
  ],
  controllers: [MemberController],
  providers: [],
})
export class AppModule {}
