import { Module } from "@nestjs/common";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule, type JwtModuleOptions } from "@nestjs/jwt";
import { CqrsModule } from "@nestjs/cqrs";
import { OAuthConnectionEntity } from "@/adapter/oauth/persistence/entity/oauth.entity";
import { MemberModule } from "@/adapter/member/member.module";
import { AuthModule } from "@/adapter/auth/auth.module";
import { KakaoOauthController } from "@/adapter/oauth/api/kakao-oauth.controller";
import { KakaoOAuthProvider } from "@/adapter/oauth/kakao/kakao-oauth-provider.service";
import { KakaOauthService } from "@/application/oauth/kaka-oauth.service";
import { OAuthConnectionMapper } from "@/adapter/oauth/persistence/mapper/oauth.mapper";
import { OAUTH_REPOSITORY } from "@/domain/oauth";
import { OAuthConnectionRepositoryImpl } from "@/adapter/oauth/persistence/oauth.repository-impl";
import { OAuthRegistrationTokenService } from "@/application/oauth/oauth-registration-token.service";
import { OAuthMemberRegisterCommandHandler } from "@/application/oauth/command/oauth-member-register.command";
import { EventStoreModule } from "@/adapter/shared/event-store";
import { KAKAO_OAUTH_PROVIDER } from "@/application/oauth/ports/oauth-provider.port";

@Module({
  imports: [
    MikroOrmModule.forFeature([OAuthConnectionEntity]),
    CqrsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => ({
        secret: configService.getOrThrow<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: "10m",
        },
      }),
    }),
    MemberModule,
    AuthModule,
    EventStoreModule,
  ],
  controllers: [KakaoOauthController],
  providers: [
    KakaoOAuthProvider,
    KakaOauthService,
    OAuthRegistrationTokenService,
    OAuthConnectionMapper,
    OAuthMemberRegisterCommandHandler,
    {
      provide: OAUTH_REPOSITORY,
      useClass: OAuthConnectionRepositoryImpl,
    },
    {
      provide: KAKAO_OAUTH_PROVIDER,
      useClass: KakaoOAuthProvider,
    },
  ],
  exports: [OAUTH_REPOSITORY, KAKAO_OAUTH_PROVIDER],
})
export class OAuthModule {}
