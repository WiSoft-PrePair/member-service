import { Module } from "@nestjs/common";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule, type JwtModuleOptions } from "@nestjs/jwt";
import { OAuthConnectionEntity } from "@/adapter/oauth/persistence/entity/oauth.entity";
import { MemberModule } from "@/adapter/member/member.module";
import { AuthModule } from "@/adapter/auth/auth.module";
import { KakaoOauthController } from "@/adapter/oauth/api/kakao-oauth.controller";
import { KakaoOauthService } from "@/adapter/oauth/kakao/kakao-oauth.service";
import { KakaoAuthService } from "@/application/oauth/kakao-auth.service";
import { OAuthConnectionMapper } from "@/adapter/oauth/persistence/mapper/oauth.mapper";
import { OAUTH_REPOSITORY } from "@/domain/oauth";
import { OAuthConnectionRepositoryImpl } from "@/adapter/oauth/persistence/oauth.repository-impl";
import { OAuthRegistrationTokenService } from "@/application/oauth/oauth-registration-token.service";

@Module({
  imports: [
    MikroOrmModule.forFeature([OAuthConnectionEntity]),
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
  ],
  controllers: [KakaoOauthController],
  providers: [
    KakaoOauthService,
    KakaoAuthService,
    OAuthRegistrationTokenService,
    OAuthConnectionMapper,
    {
      provide: OAUTH_REPOSITORY,
      useClass: OAuthConnectionRepositoryImpl,
    },
  ],
  exports: [OAUTH_REPOSITORY],
})
export class OAuthModule {}
