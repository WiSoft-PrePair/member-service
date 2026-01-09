import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { KakaoTokenResponse } from "@/adapter/oauth/kakao/types/kakao-oauth.types";

@Injectable()
export class KakaoOauthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(private readonly configService: ConfigService) {
    this.clientId = configService.getOrThrow<string>("KAKAO_CLIENT_ID");
    this.clientSecret = configService.getOrThrow<string>("KAKAO_CLIENT_SECRET");
    this.redirectUri = configService.getOrThrow<string>("KAKAO_REDIRECT_URI");
  }

  async exchangeCodeForAccessToken(code: string): Promise<KakaoTokenResponse> {
    const tokenUrl = "https://kauth.kakao.com/oauth/token";

    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      code,
    });

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body: params,
    });

    if (!response.ok) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const error = await response.json();
      throw new UnauthorizedException(
        `카카오 토큰 교환 실패: ${error.error_description}, ${error.error}`,
      );
    }

    return response.json();
  }

  async getUserInfo(accessToken: string) {
    const response = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
    });

    if (!response.ok) {
      throw new UnauthorizedException("카카오 사용자 정보 조회 실패");
    }

    return response.json();
  }

  async unlink(accessToken: string): Promise<void> {
    await fetch("https://kapi.kakao.com/v1/user/unlink", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }
}
