import { Injectable, NotFoundException } from "@nestjs/common";
import {
  RefreshTokenDto,
  RefreshTokenRepository,
} from "@/application/auth/ports";
import { RefreshTokenEntity } from "./entity/refresh-token.entity";
import { EntityManager } from "@mikro-orm/core";

@Injectable()
export class RefreshTokenRepositoryImpl implements RefreshTokenRepository {
  constructor(private readonly em: EntityManager) {}

  async save(dto: RefreshTokenDto): Promise<void> {
    const entity: RefreshTokenEntity = this.toEntity(dto);

    await this.em.persist(entity).flush();
  }

  async findByToken(token: string): Promise<RefreshTokenDto | null> {
    const entity: RefreshTokenEntity | null = await this.em.findOne(
      RefreshTokenEntity,
      { token },
    );

    return entity ? this.toDto(entity) : null;
  }

  async delete(id: string): Promise<void> {
    // await this.em.nativeDelete(RefreshTokenEntity, { id });
    const count: number = await this.em.nativeDelete(RefreshTokenEntity, {
      id,
    });

    if (!count) {
      throw new NotFoundException(
        `해당 토큰이 삭제되지 않았습니다. 다시 시도해주세요.`,
      );
    }
  }

  async deleteByToken(token: string): Promise<void> {
    const count: number = await this.em.nativeDelete(RefreshTokenEntity, {
      token,
    });

    if (!count) {
      throw new NotFoundException(
        `해당 토큰이 삭제되지 않았습니다. 다시 시도해주세요.`,
      );
    }
  }

  async deleteByMemberId(memberId: string): Promise<void> {
    const count: number = await this.em.nativeDelete(RefreshTokenEntity, {
      memberId,
    });

    if (!count) {
      throw new NotFoundException(
        `해당 토큰이 삭제되지 않았습니다. 다시 시도해주세요.`,
      );
    }
  }

  private toDto(entity: RefreshTokenEntity): RefreshTokenDto {
    return new RefreshTokenDto({
      id: entity.id,
      memberId: entity.memberId,
      token: entity.token,
      expiresAt: entity.expiresAt,
      createdAt: entity.createdAt,
    });
  }

  private toEntity(dto: RefreshTokenDto): RefreshTokenEntity {
    const entity = new RefreshTokenEntity();
    entity.id = dto.id;
    entity.memberId = dto.memberId;
    entity.token = dto.token;
    entity.expiresAt = dto.expiresAt;
    entity.createdAt = dto.createdAt;
    return entity;
  }
}
