import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/core";
import { MemberReadEntity } from "./entity/member-read.entity";
import { MemberReadRepository } from "@/application/member/ports";

@Injectable()
export class MemberReadRepositoryImpl implements MemberReadRepository {
  constructor(private readonly em: EntityManager) {}

  save(entity: MemberReadEntity): void {
    this.em.persist(entity);
  }

  async findById(id: string): Promise<MemberReadEntity | null> {
    return this.em.findOne(MemberReadEntity, { id });
  }

  async findByEmail(email: string): Promise<MemberReadEntity | null> {
    return this.em.findOne(MemberReadEntity, { email });
  }

  async findAll(options?: {
    limit?: number;
    offset?: number;
  }): Promise<MemberReadEntity[]> {
    return this.em.find(
      MemberReadEntity,
      {},
      {
        limit: options?.limit ?? 20,
        offset: options?.offset ?? 0,
        orderBy: { createdAt: "DESC" },
      },
    );
  }

  async withdraw(id: string): Promise<number> {
    return await this.em.nativeDelete(MemberReadEntity, { id });
  }
}
