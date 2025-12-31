import { Module } from "@nestjs/common";
import { REFRESH_TOKEN_REPOSITORY } from "@/adapter/auth/presistence/refresh-token.repository";
import { RefreshTokenRepositoryImpl } from "@/adapter/auth/presistence/refresh-token.repository-impl";

@Module({
  providers: [
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      useClass: RefreshTokenRepositoryImpl,
    },
  ],
})
export class AuthModule {}
