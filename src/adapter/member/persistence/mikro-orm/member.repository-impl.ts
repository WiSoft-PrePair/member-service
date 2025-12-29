import { Injectable } from "@nestjs/common";
import { Member, MemberRepository } from "@/domain/member";
import { EntityManager } from "@mikro-orm/core";
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
}
