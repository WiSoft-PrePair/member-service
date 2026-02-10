import { Injectable } from "@nestjs/common";
import {
  OAuthConnection,
  OAuthProvider,
  OauthRepository,
} from "@/domain/oauth";
import { EntityManager } from "@mikro-orm/postgresql";
import { OAuthConnectionMapper } from "@/adapter/oauth/persistence/mapper/oauth.mapper";
import { OAuthConnectionEntity } from "@/adapter/oauth/persistence/entity/oauth.entity";

@Injectable()
export class OAuthConnectionRepositoryImpl implements OauthRepository {
  constructor(
    private readonly em: EntityManager,
    private readonly mapper: OAuthConnectionMapper,
  ) {}

  save(connection: OAuthConnection): OAuthConnection {
    const entity: OAuthConnectionEntity = this.mapper.toEntity(connection);

    this.em.persist(entity);

    return connection;
  }

  async findByProviderAndProviderId(
    provider: OAuthProvider,
    providerId: string,
  ): Promise<OAuthConnection | null> {
    const entity: OAuthConnectionEntity | null = await this.em.findOne(
      OAuthConnectionEntity,
      {
        provider,
        providerId,
      },
    );

    if (!entity) {
      return null;
    }

    return this.mapper.toDomain(entity);
  }

  async findByMemberIdAndProvider(
    memberId: string,
    provider: OAuthProvider,
  ): Promise<OAuthConnection | null> {
    const entity: OAuthConnectionEntity | null = await this.em.findOne(
      OAuthConnectionEntity,
      { memberId, provider },
    );

    if (!entity) {
      return null;
    }

    return this.mapper.toDomain(entity);
  }

  async findByMemberId(memberId: string): Promise<OAuthConnection[]> {
    const entities: OAuthConnectionEntity[] = await this.em.find(
      OAuthConnectionEntity,
      { memberId },
    );

    return entities.map((e) => this.mapper.toDomain(e));
  }

  async updateTokens(
    connectionId: string,
    tokens: {
      accessToken: string;
      refreshToken?: string;
      tokenExpiresAt: Date;
    },
  ): Promise<void> {
    const entity: OAuthConnectionEntity = await this.em.findOneOrFail(
      OAuthConnectionEntity,
      {
        id: connectionId,
      },
    );

    entity.accessToken = tokens.accessToken;
    entity.refreshToken = tokens.refreshToken;
    entity.tokenExpiresAt = tokens.tokenExpiresAt;
  }

  async disconnect(id: string): Promise<void> {
    await this.em.nativeDelete(OAuthConnectionEntity, { id });
  }

  async disconnectAllByMemberId(memberId: string): Promise<void> {
    await this.em.nativeDelete(OAuthConnectionEntity, { memberId });
  }
}
