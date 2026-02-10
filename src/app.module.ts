import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { MemberModule } from "@/adapter/member/member.module";
import { PersistenceModule } from "@/adapter/member/persistence/persistence.module";
import { ConfigModule } from "@nestjs/config";
import { envSchema } from "@/config/env.config";
import { CqrsModule } from "@nestjs/cqrs";
import { AuthModule } from "@/adapter/auth/auth.module";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { TransformResponseInterceptor } from "@/adapter/shared/api/interceptors/transform-response.interceptor";
import { JwtAuthGuard } from "@/adapter/auth/security";
import { OAuthModule } from "@/adapter/oauth/oauth.module";
import { LoggerModule } from "@/adapter/shared/logger/logger.module";
import { CorrelationIdMiddleware } from "@/adapter/shared/middleware/correlation-id.middleware";
import { HealthController } from "@/adapter/shared/api/health.controller";
import { InterviewModule } from "@/adapter/interview/interview.module";
import { PrismaModule } from "@/adapter/shared/prisma";
import { ScheduleModule } from "@nestjs/schedule";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, any>) => envSchema.parse(config),
    }),
    CqrsModule.forRoot(),
    ScheduleModule.forRoot(),
    PersistenceModule,
    MemberModule,
    AuthModule,
    OAuthModule,
    LoggerModule,
    InterviewModule,
    PrismaModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformResponseInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes("*");
  }
}
