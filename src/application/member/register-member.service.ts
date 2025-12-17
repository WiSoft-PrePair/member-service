import { Inject, Injectable } from "@nestjs/common";
import type { MemberRepository } from "@/domain/member";
import {
  Member,
  MEMBER_REPOSITORY,
  MemberRegisterRequest,
} from "@/domain/member";
import { EntityManager } from "@mikro-orm/core";

@Injectable()
export class RegisterMemberService {
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    private readonly em: EntityManager,
  ) {}

  async register(request: MemberRegisterRequest): Promise<Member> {
    const member: Member = Member.register(request);

    this.memberRepository.save(member);
    await this.em.flush();

    return member;
  }
}
