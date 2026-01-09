export type OAuthProvider = "kakao" | "google" | "naver";

export type OAuthConnectionType = {
  id: string;
  memberId: string;
  provider: OAuthProvider;
  providerId: string;
  email: string;
  connectedAt: Date;
};

export type ConnectOAuthRequest = {
  memberId: string;
  provider: OAuthProvider;
  providerId: string;
  email: string;
};
