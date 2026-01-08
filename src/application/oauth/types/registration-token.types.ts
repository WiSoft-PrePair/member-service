import { OAuthProvider } from "@/domain/oauth";

export interface OAuthRegistrationPayload {
  email: string;
  nickname: string;
  provider: OAuthProvider;
  providerId: string;
  type: "oauth_registration";
}
