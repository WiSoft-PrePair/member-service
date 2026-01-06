import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from "@nestjs/cqrs";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  InvalidVerificationCodeException,
  Member,
  MEMBER_REPOSITORY,
  MemberEmailChangedEvent,
  type MemberRepository,
} from "@/domain/member";
import { EmailVerificationService } from "@/application/member/service/email-verification.service";
import { EntityManager } from "@mikro-orm/postgresql";
import { Transactional } from "@mikro-orm/core";
import {
  createDomainEvent,
  EVENT_STORE,
  type EventStore,
} from "@/domain/shared";

export class ChangeEmailCommand implements ICommand {
  constructor(
    public readonly memberId: string,
    public readonly verificationToken: string,
  ) {}
}

@Injectable()
@CommandHandler(ChangeEmailCommand)
export class VerifyChangeEmailCommandHandler implements ICommandHandler<
  ChangeEmailCommand,
  string
> {
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(EVENT_STORE)
    private readonly eventStore: EventStore,
    private readonly em: EntityManager,
    private readonly eventBus: EventBus,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  @Transactional()
  async execute(command: ChangeEmailCommand): Promise<string> {
    const { memberId, verificationToken } = command;

    const newEmail: string | null =
      this.emailVerificationService.consumeToken(verificationToken);

    if (!newEmail) {
      throw new InvalidVerificationCodeException();
    }

    const member: Member | null =
      await this.memberRepository.findById(memberId);

    if (!member) {
      throw new NotFoundException(`해당 해원이 없습니다.`);
    }

    const updateMember: Member = member.changeEmail(newEmail);

    this.memberRepository.update(updateMember);

    this.eventStore.append(
      createDomainEvent(memberId, "MemberEmailChanged", {
        id: memberId,
        email: newEmail,
      }),
    );

    await this.em.flush();

    this.eventBus.publish(new MemberEmailChangedEvent(memberId, newEmail));

    return newEmail;
  }
}
