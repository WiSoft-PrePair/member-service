import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/core";
import { Member, MemberRepository } from "@/domain/member";
import { MemberMapper } from "@/adapter/member/persistence/mikro-orm/mapper/member.mapper";
import { MemberEntity } from "@/adapter/member/persistence/mikro-orm/entity/member.entity";

@Injectable()
export class MemberRepositoryImpl implements MemberRepository {
  private readonly mapper: MemberMapper = new MemberMapper();

  constructor(private readonly em: EntityManager) {}

  save(member: Member): Member {
    const entity: MemberEntity = this.mapper.toEntity(member);

    this.em.persist(entity);

    return member;
  }
}
