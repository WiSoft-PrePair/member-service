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
  type MemberRepository,
  PASSWORD_ENCODER,
  type PasswordEncoder,
} from "@/domain/member";
import { EVENT_STORE, type EventStore } from "@/domain/shared";
import { EntityManager } from "@mikro-orm/postgresql";
import { EmailVerificationService } from "@/application/member";
import { Transactional } from "@mikro-orm/core";
import { MemberPasswordResetEvent } from "@/domain/member/events/member-password-reset.event";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

export interface ResetPasswordResult {
  memberId: string;
}

export class ResetPasswordCommand implements ICommand {
  constructor(
    public readonly email: string,
    public readonly verificationCode: string,
    public readonly newPassword: string,
  ) {}
}

@Injectable()
@CommandHandler(ResetPasswordCommand)
export class ResetPasswordCommandHandler
  implements ICommandHandler<ResetPasswordCommand>
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
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  @Transactional()
  async execute(command: ResetPasswordCommand): Promise<ResetPasswordResult> {
    this.logger.log("Password reset started", {
      module: "ResetPasswordCommandHandler",
      email: command.email,
    });

    const isValid: boolean = this.emailVerificationService.verifyCode(
      command.email,
      command.verificationCode,
    );

    if (!isValid) {
      throw new InvalidVerificationCodeException();
    }

    const existMember: Member | null = await this.memberRepository.findByEmail(
      command.email,
    );

    if (!existMember) {
      throw new NotFoundException("Member");
    }


    // 임시 비밀번호를 만들어 돌려주지 않고, 인증을 마친 사용자가 정한 새 비밀번호로 바로 바꾼다
    const updatedMember: Member = existMember.resetPassword(
      command.newPassword,
      this.passwordEncoder,
    );

    this.memberRepository.update(updatedMember);

    for (const event of updatedMember.getDomainEvents()) {
      this.eventStore.append(event);
    }

    await this.em.flush();

    this.eventBus.publish(
      new MemberPasswordResetEvent(
        updatedMember.id,
        updatedMember.password.value,
      ),
    );

    this.emailVerificationService.consumeVerifiedEmail(command.email);

    this.logger.log("Password reset completed", {
      module: "ResetPasswordCommandHandler",
      memberId: updatedMember.id,
      email: command.email,
    });

    updatedMember.clearDomainEvents();

    return {
      memberId: updatedMember.id,
    };
  }
}
