export type OAuthProvider = "kakao" | "google" | "naver";

export type OAuthConnectionType = {
  id: string;
  memberId: string;
  provider: OAuthProvider;
  providerId: string;
  email: string;
  accessToken?: string;
  connectedAt: Date;
};

export type ConnectOAuthRequest = {
  memberId: string;
  provider: OAuthProvider;
  providerId: string;
  email: string;
  accessToken?: string;
};
