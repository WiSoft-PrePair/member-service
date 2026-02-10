export interface KakaoTokenRefreshResult {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt: Date;
}

export interface KakaoTokenRefresher {
  refreshToken(
    connectionId: string,
    refreshToken: string,
  ): Promise<KakaoTokenRefreshResult>;
}

export const KAKAO_TOKEN_REFRESHER: symbol = Symbol("KAKAO_TOKEN_REFRESHER");
