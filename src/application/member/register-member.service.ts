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
import {
  createDomainEvent,
  EVENT_STORE,
  type EventStore,
} from "@/domain/shared";

@Injectable()
export class RegisterMemberService {
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(PASSWORD_ENCODER)
    private readonly passwordEncoder: PasswordEncoder,
    @Inject(EVENT_STORE)
    private readonly eventStore: EventStore,
    private readonly em: EntityManager,
  ) {}

  @Transactional()
  async register(registerRequest: RegisterMemberRequest): Promise<Member> {
    const member: Member = Member.register(
      registerRequest,
      this.passwordEncoder,
    );

    this.memberRepository.register(member);

    this.eventStore.append(
      createDomainEvent(member.id, "MemberRegistered", {
        id: member.id,
        email: member.email.value,
        password: member.password.value,
        job: member.job,
        nickname: member.nickname,
        notification: member.notification,
        frequency: member.frequency,
        point: member.point,
        isPro: member.isPro,
      }),
    );

    await this.em.flush();

    return member;
  }
}
