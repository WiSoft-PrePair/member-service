import { OAuthProvider } from "@/domain/oauth/types";
import { createDomainEvent, DomainEvent } from "@/domain/shared";

export type OAuthConnectedPayload = {
  connectionId: string;
  memberId: string;
  provider: OAuthProvider;
  providerId: string;
  email: string;
};

export function createOAuthConnectedEvent(
  payload: OAuthConnectedPayload,
): DomainEvent<OAuthConnectedPayload> {
  return createDomainEvent(payload.connectionId, "OAuthConnected", payload);
}
