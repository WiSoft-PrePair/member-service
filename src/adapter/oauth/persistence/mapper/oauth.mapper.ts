import { Injectable } from "@nestjs/common";
import { OAuthConnectionEntity } from "@/adapter/oauth/persistence/entity/oauth.entity";
import { OAuthConnection, OAuthProvider } from "@/domain/oauth";

@Injectable()
export class OAuthConnectionMapper {
  toDomain(entity: OAuthConnectionEntity) {
    return OAuthConnection.of({
      id: entity.id,
      memberId: entity.memberId,
      provider: entity.provider as OAuthProvider,
      providerId: entity.providerId,
      email: entity.email,
      connectedAt: entity.connectedAt,
    });
  }

  toEntity(domain: OAuthConnection): OAuthConnectionEntity {
    const entity = new OAuthConnectionEntity();

    entity.id = domain.id;
    entity.memberId = domain.memberId;
    entity.provider = domain.provider;
    entity.providerId = domain.providerId;
    entity.email = domain.email;
    entity.connectedAt = domain.connectedAt;

    return entity;
  }
}
