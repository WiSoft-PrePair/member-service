import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  KakaoTokenRefreshResponse,
  KakaoTokenResponse,
  KakaoUserInfo,
} from "@/adapter/oauth/kakao/types/kakao-oauth.types";
import {
  OAuthProvider,
  OAuthTokenResponse,
  OAuthUserInfo,
} from "@/application/oauth/ports/oauth-provider.port";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

/** 카카오 토큰 오류를 사용자에게 보여 줄 문장으로 바꾼다. 원문은 로그에만 남긴다 */
function kakaoTokenErrorMessage(error: {
  error: string;
  error_description: string;
}) {
  if (error.error_description?.includes("rate limit")) {
    return "카카오 로그인 요청이 잠시 많았어요. 1~2분 뒤에 다시 시도해 주세요.";
  }
  if (error.error === "invalid_grant") {
    return "카카오 로그인 시간이 지났어요. 처음부터 다시 로그인해 주세요.";
  }
  return "카카오 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.";
}

@Injectable()
export class KakaoOAuthProvider implements OAuthProvider {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly defaultRedirectUri: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject(LOGGER) private readonly logger: ILogger,
  ) {
    this.clientId = configService.getOrThrow<string>("KAKAO_CLIENT_ID");
    this.clientSecret = configService.getOrThrow<string>("KAKAO_CLIENT_SECRET");
    this.defaultRedirectUri =
      configService.getOrThrow<string>("KAKAO_REDIRECT_URI");
  }

  async exchangeCodeForAccessToken(
    code: string,
    redirectUri?: string,
  ): Promise<OAuthTokenResponse> {
    const tokenUrl = "https://kauth.kakao.com/oauth/token";

    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: redirectUri ?? this.defaultRedirectUri,
      code,
    });

    const response: Response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body: params,
    });

    if (!response.ok) {
      const error = (await response.json()) as {
        error: string;
        error_description: string;
      };
      this.logger.warn("Kakao token exchange failed", {
        module: "KakaoOAuthProvider",
        status: response.status,
        error: error.error,
        description: error.error_description,
      });
      throw new UnauthorizedException(kakaoTokenErrorMessage(error));
    }

    const kakaoTokens = (await response.json()) as KakaoTokenResponse;

    return {
      accessToken: kakaoTokens.access_token,
      refreshToken: kakaoTokens.refresh_token,
      expiresIn: kakaoTokens.expires_in,
    };
  }

  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    const response: Response = await fetch(
      "https://kapi.kakao.com/v2/user/me",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
      },
    );

    if (!response.ok) {
      throw new UnauthorizedException("카카오 사용자 정보 조회 실패");
    }

    const kakaoUser: KakaoUserInfo = (await response.json()) as KakaoUserInfo;

    const email: string | undefined = kakaoUser.kakao_account?.email;
    const nickname: string | undefined =
      kakaoUser.kakao_account?.profile?.nickname;

    if (!email || !nickname) {
      throw new UnauthorizedException(
        "카카오 로그인에 필요한 정보(이메일, 닉네임) 동의가 필요합니다.",
      );
    }

    return {
      providerId: String(kakaoUser.id),
      email,
      nickname,
      profileImageUrl: kakaoUser.kakao_account?.profile?.profile_image_url,
    };
  }

  async unlink(accessToken: string): Promise<void> {
    await fetch("https://kapi.kakao.com/v1/user/unlink", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
    const parmas = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
    });

    const response: Response = await fetch(
      "https://kauth.kakao.com/oauth/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
        body: parmas,
      },
    );

    if (!response.ok) {
      const error = (await response.json()) as {
        error: string;
        error_description: string;
      };
      throw new UnauthorizedException(
        `카카오 토큰 갱신 실패: ${error.error_description}`,
      );
    }

    const kakaoTokens = (await response.json()) as KakaoTokenRefreshResponse;

    return {
      accessToken: kakaoTokens.access_token,
      refreshToken: kakaoTokens.refresh_token,
      expiresIn: kakaoTokens.expires_in,
    };
  }
}
