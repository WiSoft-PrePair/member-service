import { Injectable } from "@nestjs/common";
import { RefreshTokenRepository } from "@/application/auth/ports";
import { RefreshTokenEntity } from "./entity/refresh-token.entity";
import { EntityManager } from "@mikro-orm/core";

@Injectable()
export class RefreshTokenRepositoryImpl implements RefreshTokenRepository {
  constructor(private readonly em: EntityManager) {}

  async save(entity: RefreshTokenEntity): Promise<void> {
    const refreshToken: RefreshTokenEntity = this.em.create(
      RefreshTokenEntity,
      entity,
    );

    this.em.persist(refreshToken);
    await this.em.flush();
  }

  findByToken(token: string): Promise<RefreshTokenEntity | null> {
    return this.em.findOne(RefreshTokenEntity, { token });
  }

  async delete(id: string): Promise<void> {
    const entity: RefreshTokenEntity | null = await this.em.findOne(
      RefreshTokenEntity,
      { id },
    );

    if (entity) {
      this.em.remove(entity);
      await this.em.flush();
    }
  }

  async deleteByToken(token: string): Promise<void> {
    const entity: RefreshTokenEntity | null = await this.em.findOne(
      RefreshTokenEntity,
      { token },
    );

    if (entity) {
      this.em.remove(entity);
      await this.em.flush();
    }
  }

  async deleteByMemberId(memberId: string): Promise<void> {
    await this.em.nativeDelete(RefreshTokenEntity, { memberId });
  }
}
