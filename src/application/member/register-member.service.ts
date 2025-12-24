import { Inject, Injectable } from "@nestjs/common";
import {
  Member,
  MEMBER_REPOSITORY,
  type MemberRepository,
  PASSWORD_ENCODER,
  type PasswordEncoder,
  type RegisterMemberRequest,
} from "@/domain/member";
import { EntityManager, Transactional } from "@mikro-orm/core";

@Injectable()
export class RegisterMemberService {
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(PASSWORD_ENCODER)
    private readonly passwordEncoder: PasswordEncoder,
    private readonly em: EntityManager,
  ) {}

  @Transactional()
  async register(registerRequest: RegisterMemberRequest): Promise<Member> {
    const member: Member = Member.register(
      registerRequest,
      this.passwordEncoder,
    );

    this.memberRepository.register(member);
    await this.em.flush();

    return member;
  }
}
