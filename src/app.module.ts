import { Module } from "@nestjs/common";
import { MemberModule } from "@/adapter/member/member.module";
import { PersistenceModule } from "@/adapter/member/persistence/persistence.module";
import { ConfigModule } from "@nestjs/config";
import { envSchema } from "@/config/env.config";
import { CqrsModule } from "@nestjs/cqrs";
import { AuthModule } from "@/adapter/auth/auth.module";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { TransformResponseInterceptor } from "@/adapter/shared/api/interceptors/transform-response.interceptor";
import { HttpExceptionFilter } from "@/adapter/shared/api/filters/http-exception.filter";
import { JwtAuthGuard } from "@/adapter/auth/security";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, any>) => envSchema.parse(config),
    }),
    CqrsModule.forRoot(),
    PersistenceModule,
    MemberModule,
    AuthModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
