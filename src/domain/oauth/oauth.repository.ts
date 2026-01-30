import { OAuthConnection } from "@/domain/oauth/oauth";
import { OAuthProvider } from "@/domain/oauth/types";

export interface OauthRepository {
  save(connection: OAuthConnection): OAuthConnection;

  findByProviderAndProviderId(
    provider: OAuthProvider,
    providerId: string,
  ): Promise<OAuthConnection | null>;

  findByMemberIdAndProvider(
    memberId: string,
    provider: OAuthProvider,
  ): Promise<OAuthConnection | null>;

  findByMemberId(memberId: string): Promise<OAuthConnection[]>;

  disconnect(id: string): Promise<void>;

  disconnectAllByMemberId(memberId: string): Promise<void>;
}

export const OAUTH_REPOSITORY = Symbol("OauthRepository");
