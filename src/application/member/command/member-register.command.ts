import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from "@nestjs/cqrs";
import {
  FrequencyEnum,
  Member,
  MEMBER_REPOSITORY,
  type MemberRepository,
  NotificationEnum,
  PASSWORD_ENCODER,
  type PasswordEncoder,
} from "@/domain/member";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import {
  createDomainEvent,
  EVENT_STORE,
  type EventStore,
} from "@/domain/shared";
import { EntityManager, Transactional } from "@mikro-orm/core";
import { MemberRegisterEvent } from "@/domain/member/events";
import { EmailVerificationService } from "@/application/member";

export class MemberRegisterCommand implements ICommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly job: string,
    public readonly nickname: string,
    public readonly notification: NotificationEnum,
    public readonly frequency: FrequencyEnum,
  ) {}
}

@Injectable()
@CommandHandler(MemberRegisterCommand)
export class MemberRegisterCommandHandler
  implements ICommandHandler<MemberRegisterCommand, string>
{
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(PASSWORD_ENCODER)
    private readonly passwordEncoder: PasswordEncoder,
    @Inject(EVENT_STORE)
    private readonly eventStore: EventStore,
    private readonly eventBus: EventBus,
    private readonly em: EntityManager,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  @Transactional()
  async execute(command: MemberRegisterCommand): Promise<string> {
    if (!this.emailVerificationService.isEmailVerified(command.email)) {
      throw new UnauthorizedException(`이메일 검증을 해주세요.`);
    }

    this.emailVerificationService.consumeVerifiedEmail(command.email);

    const member: Member = Member.register(
      {
        email: command.email,
        password: command.password,
        job: command.job,
        nickname: command.nickname,
        notification: command.notification,
        frequency: command.frequency,
      },
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

    this.eventBus.publish(
      new MemberRegisterEvent(
        member.id,
        member.email.value,
        member.password.value,
        member.job,
        member.nickname,
        member.notification,
        member.frequency,
      ),
    );

    return member.id;
  }
}
