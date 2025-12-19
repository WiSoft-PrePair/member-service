import { Inject, Injectable } from "@nestjs/common";
import {
  type MemberRepository,
  PASSWORD_ENCODER,
  type PasswordEncoder,
} from "@/domain/member";
import {
  Member,
  MEMBER_REPOSITORY,
  type MemberRegisterRequest,
} from "@/domain/member";
import { EntityManager } from "@mikro-orm/core";

@Injectable()
export class RegisterMemberService {
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(PASSWORD_ENCODER)
    private readonly passwordEncoder: PasswordEncoder,
    private readonly em: EntityManager,
  ) {}

  async register(request: MemberRegisterRequest): Promise<Member> {
    const hashedPassword: string = this.passwordEncoder.encode(
      request.password,
    );

    const member: Member = Member.register({
      ...request,
      password: hashedPassword,
    });

    this.memberRepository.save(member);
    await this.em.flush();

    return member;
  }
}
