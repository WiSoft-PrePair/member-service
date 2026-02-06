import {
  ConnectOAuthRequest,
  OAuthConnectionType,
  OAuthProvider,
} from "@/domain/oauth/types";
import { randomUUID } from "crypto";

export class OAuthConnection {
  readonly id: string;
  readonly memberId: string;
  readonly provider: OAuthProvider;
  readonly providerId: string;
  readonly email: string;
  readonly accessToken?: string;
  readonly connectedAt: Date;

  private constructor(data: OAuthConnectionType) {
    this.id = data.id;
    this.memberId = data.memberId;
    this.provider = data.provider;
    this.providerId = data.providerId;
    this.email = data.email;
    this.accessToken = data.accessToken;
    this.connectedAt = data.connectedAt;
  }

  public static connect(request: ConnectOAuthRequest): OAuthConnection {
    return new OAuthConnection({
      id: randomUUID(),
      memberId: request.memberId,
      provider: request.provider,
      providerId: request.providerId,
      email: request.email,
      accessToken: request.accessToken,
      connectedAt: new Date(),
    });
  }

  public static of(data: OAuthConnectionType): OAuthConnection {
    return new OAuthConnection(data);
  }

  public isProvider(provider: OAuthProvider): boolean {
    return this.provider === provider;
  }
}
