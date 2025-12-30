import { Module } from "@nestjs/common";
import { MemberModule } from "@/adapter/member/member.module";
import { PersistenceModule } from "@/adapter/member/persistence/persistence.module";
import { ConfigModule } from "@nestjs/config";
import { envSchema } from "@/config/env.config";
import { CqrsModule } from "@nestjs/cqrs";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, any>) => envSchema.parse(config),
    }),
    CqrsModule.forRoot(),
    PersistenceModule,
    MemberModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
