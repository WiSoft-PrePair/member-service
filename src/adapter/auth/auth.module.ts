import { Module } from "@nestjs/common";
import { REFRESH_TOKEN_REPOSITORY } from "@/adapter/auth/persistence/refresh-token.repository";
import { RefreshTokenRepositoryImpl } from "@/adapter/auth/persistence/refresh-token.repository-impl";
import { PassportModule } from "@nestjs/passport";
import { JwtModule, type JwtModuleOptions } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { RefreshTokenEntity } from "@/adapter/auth/persistence/entity/refresh-token.entity";
import { MemberModule } from "@/adapter/member/member.module";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { AuthController } from "@/adapter/auth/api/auth.controller";
import { AuthService, RefreshTokenService } from "@/application/auth";
import { JwtService, JwtStrategy } from "@/adapter/auth/security";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "auth" }),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => ({
        secret: configService.getOrThrow<string>("JWT_SECRET"),
        signOptions: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          expiresIn: (configService.get<string>(
            "JWT_ACCESS_TOKEN_EXPIRES_IN",
          ) || "15m") as any,
        },
      }),
    }),
    MikroOrmModule.forFeature([RefreshTokenEntity]),
    MemberModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RefreshTokenService,
    JwtService,
    JwtStrategy,
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      useClass: RefreshTokenRepositoryImpl,
    },
  ],
})
export class AuthModule {}
