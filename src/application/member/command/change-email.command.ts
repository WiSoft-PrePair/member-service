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
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

export class ChangeEmailCommand implements ICommand {
  constructor(
    public readonly memberId: string,
    public readonly newEmail: string,
  ) {}
}

@Injectable()
@CommandHandler(ChangeEmailCommand)
export class VerifyChangeEmailCommandHandler
  implements ICommandHandler<ChangeEmailCommand, string>
{
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(EVENT_STORE)
    private readonly eventStore: EventStore,
    private readonly em: EntityManager,
    private readonly eventBus: EventBus,
    private readonly emailVerificationService: EmailVerificationService,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  @Transactional()
  async execute(command: ChangeEmailCommand): Promise<string> {
    const { memberId, newEmail } = command;

    this.logger.log("Email change started", {
      module: "VerifyChangeEmailCommandHandler",
      memberId,
      newEmail,
    });

    try {
      if (!this.emailVerificationService.isEmailVerified(newEmail)) {
        throw new InvalidVerificationCodeException();
      }

      this.emailVerificationService.consumeVerifiedEmail(newEmail);

      const member: Member | null =
        await this.memberRepository.findById(memberId);

      if (!member) {
        throw new NotFoundException(`해당 회원이 없습니다.`);
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

      this.logger.log("Email change completed", {
        module: "VerifyChangeEmailCommandHandler",
        memberId,
        newEmail,
      });

      return newEmail;
    } catch (error) {
      this.logger.error(
        "Email change failed",
        error instanceof Error ? error : undefined,
        {
          module: "VerifyChangeEmailCommandHandler",
          memberId,
          newEmail,
        },
      );
      throw error;
    }
  }
}
