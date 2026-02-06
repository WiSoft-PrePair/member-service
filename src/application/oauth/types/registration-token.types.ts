import { OAuthProvider } from "@/domain/oauth";

export interface OAuthRegistrationPayload {
  email: string;
  nickname: string;
  provider: OAuthProvider;
  providerId: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresIn: number;
  type: "oauth_registration";
}
