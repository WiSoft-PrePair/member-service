import { Injectable } from "@nestjs/common";
import { Member, MemberRepository } from "@/domain/member";
import { EntityManager } from "@mikro-orm/postgresql";
import { MemberEntity } from "./entity";
import { MemberMapper } from "./mapper";

@Injectable()
export class MemberRepositoryImpl implements MemberRepository {
  constructor(
    private readonly em: EntityManager,
    private readonly mapper: MemberMapper,
  ) {}
  register(member: Member): Member {
    const entity: MemberEntity = this.mapper.toEntity(member);

    this.em.persist(entity);

    return member;
  }

  withdraw(memberId: string): void {
    this.em.nativeDelete(MemberEntity, { id: memberId });
  }

  update(member: Member): Member {
    const entity: MemberEntity = this.mapper.toEntity(member);

    this.em.merge(entity);

    return member;
  }

  async findById(id: string): Promise<Member | null> {
    const entity: MemberEntity | null = await this.em.findOne(MemberEntity, {
      id,
    });

    if (!entity) {
      return null;
    }

    return this.mapper.toDomain(entity);
  }
}
