import { EntityManager } from "@mikro-orm/postgresql";
import { Injectable } from "@nestjs/common";
import {
  MemberReadDto,
  MemberReadRepository,
} from "@/application/member/ports";
import { MemberReadEntity } from "./entity/member-read.entity";

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
    const knex = this.em.getKnex();

    const rows = await knex("member_read as m")
      .select("m.*")
      .orderBy("m.created_at", "desc")
      .limit(options?.limit ?? 20)
      .offset(options?.offset ?? 0);

    return rows.map(
      (row) =>
        new MemberReadDto({
          id: row.id,
          email: row.email,
          job: row.job,
          nickname: row.nickname,
          point: row.point,
          isPro: row.is_pro,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          activity: row.activity,
        }),
    );
  }

  async countAll(): Promise<number> {
    return await this.em.count(MemberReadEntity, {});
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
    entity.point = dto.point;
    entity.isPro = dto.isPro;
    entity.createdAt = dto.createdAt;
    entity.updatedAt = dto.updatedAt;
    entity.activity = dto.activity;

    return entity;
  }
}
