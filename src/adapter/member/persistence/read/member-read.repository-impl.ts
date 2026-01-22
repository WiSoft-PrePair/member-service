import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/core";
import { MemberReadEntity } from "./entity/member-read.entity";
import {
  MemberReadDto,
  MemberReadRepository,
} from "@/application/member/ports";

@Injectable()
export class MemberReadRepositoryImpl implements MemberReadRepository {
  constructor(private readonly em: EntityManager) {}

  save(dto: MemberReadDto): void {
    const entity: MemberReadEntity = this.toEntity(dto);

    // persist 대신 merge 사용: INSERT/UPDATE 자동 판단
    this.em.merge(entity);
  }

  async findById(id: string): Promise<MemberReadDto | null> {
    const entity: MemberReadEntity | null = await this.em.findOne(
      MemberReadEntity,
      {
        id,
      },
    );

    return entity ? this.toDto(entity) : null;
  }

  async findByEmail(email: string): Promise<MemberReadEntity | null> {
    const entity: MemberReadEntity | null = await this.em.findOne(
      MemberReadEntity,
      { email },
    );

    return entity ? this.toDto(entity) : null;
  }

  async findAll(options?: {
    limit?: number;
    offset?: number;
  }): Promise<MemberReadEntity[]> {
    const entities: MemberReadEntity[] | null = await this.em.find(
      MemberReadEntity,
      {},
      {
        limit: options?.limit ?? 20,
        offset: options?.offset ?? 0,
        orderBy: { createdAt: "DESC" },
      },
    );

    return entities.map((entity) => this.toDto(entity));
  }

  async withdraw(id: string): Promise<number> {
    return await this.em.nativeDelete(MemberReadEntity, { id });
  }

  // Entity -> Dto
  private toDto(entity: MemberReadEntity): MemberReadDto {
    return new MemberReadDto({
      id: entity.id,
      email: entity.email,
      job: entity.job,
      nickname: entity.nickname,
      notification: entity.notification,
      frequency: entity.frequency,
      point: entity.point,
      isPro: entity.isPro,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      activity: entity.activity,
    });
  }

  // Dto -> Entity
  private toEntity(dto: MemberReadDto): MemberReadEntity {
    const entity = new MemberReadEntity();

    entity.id = dto.id;
    entity.email = dto.email;
    entity.job = dto.job;
    entity.nickname = dto.nickname;
    entity.notification = dto.notification;
    entity.frequency = dto.frequency;
    entity.point = dto.point;
    entity.isPro = dto.isPro;
    entity.createdAt = dto.createdAt;
    entity.updatedAt = dto.updatedAt;
    entity.activity = dto.activity;

    return entity;
  }
}
