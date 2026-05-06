export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export interface OAuthUserInfo {
  providerId: string;
  email: string;
  nickname: string;
  profileImageUrl?: string;
}

export interface OAuthProvider {
  exchangeCodeForAccessToken(
    code: string,
    redirectUri?: string,
  ): Promise<OAuthTokenResponse>;

  getUserInfo(accessToken: string): Promise<OAuthUserInfo>;

  unlink(accessToken: string): Promise<void>;

  refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse>;
}

export const KAKAO_OAUTH_PROVIDER = Symbol("KakaoOAuthProvider");
