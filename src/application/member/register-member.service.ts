import { Inject, Injectable } from "@nestjs/common";
import {
  Member,
  MEMBER_REPOSITORY,
  type MemberRepository,
  RegisterMemberRequest,
} from "@/domain/member";
import { EntityManager } from "@mikro-orm/core";
import {
  PASSWORD_ENCODER,
  type PasswordEncoder,
} from "@/domain/member/password-encoder";

@Injectable()
export class RegisterMemberService {
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(PASSWORD_ENCODER)
    private readonly passwordEncoder: PasswordEncoder,
    private readonly em: EntityManager,
  ) {}
  async register(registerRequest: RegisterMemberRequest): Promise<Member> {
    const hashedPassword: string = this.passwordEncoder.encode(
      registerRequest.password,
    );

    const member: Member = Member.register({
      ...registerRequest,
      password: hashedPassword,
    });

    this.memberRepository.register(member);
    await this.em.flush();

    return member;
  }
}
