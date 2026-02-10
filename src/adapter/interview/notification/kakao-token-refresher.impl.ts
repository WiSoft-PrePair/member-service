import { Inject, Injectable } from "@nestjs/common";
import {
  KakaoTokenRefresher,
  KakaoTokenRefreshResult,
} from "@/application/interview/ports";
import {
  KAKAO_OAUTH_PROVIDER,
  type OAuthProvider,
} from "@/application/oauth/ports";
import { OAUTH_REPOSITORY, type OauthRepository } from "@/domain/oauth";

@Injectable()
export class KakaoTokenRefresherImpl implements KakaoTokenRefresher {
  constructor(
    @Inject(KAKAO_OAUTH_PROVIDER)
    private readonly kakaoProvider: OAuthProvider,
    @Inject(OAUTH_REPOSITORY)
    private readonly oauthRepository: OauthRepository,
  ) {}

  async refreshToken(
    connectionId: string,
    refreshToken: string,
  ): Promise<KakaoTokenRefreshResult> {
    const tokenResponse =
      await this.kakaoProvider.refreshAccessToken(refreshToken);
    const tokenExpiresAt = new Date(
      Date.now() + tokenResponse.expiresIn * 1000,
    );

    await this.oauthRepository.updateTokens(connectionId, {
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken ?? refreshToken,
      tokenExpiresAt,
    });

    return {
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
      tokenExpiresAt,
    };
  }
}
