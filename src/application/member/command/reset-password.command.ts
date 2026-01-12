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
import {
  createDomainEvent,
  EVENT_STORE,
  type EventStore,
} from "@/domain/shared";
import { EntityManager } from "@mikro-orm/postgresql";
import { EmailVerificationService } from "@/application/member";
import { Transactional } from "@mikro-orm/core";
import { MemberPasswordResetEvent } from "@/domain/member/events/member-password-reset.event";

export class ResetPasswordCommand implements ICommand {
  constructor(
    public readonly email: string,
    public readonly verificationCode: string,
  ) {}
}

@Injectable()
@CommandHandler(ResetPasswordCommand)
export class ResetPasswordCommandHandler implements ICommandHandler<ResetPasswordCommand> {
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
  async execute(command: ResetPasswordCommand): Promise<any> {
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

    const tempPassword: string = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0");

    const updatedMember: Member = existMember.resetPassword(
      tempPassword,
      this.passwordEncoder,
    );

    this.memberRepository.update(updatedMember);

    this.eventStore.append(
      createDomainEvent(updatedMember.id, "MemberPasswordReset", {
        id: updatedMember.id,
        resetAt: new Date().toISOString(),
      }),
    );

    await this.em.flush();

    this.eventBus.publish(
      new MemberPasswordResetEvent(
        updatedMember.id,
        updatedMember.password.value,
      ),
    );

    this.emailVerificationService.consumeVerifiedEmail(command.email);

    return {
      memberId: updatedMember.id,
      newPassword: tempPassword,
    };
  }
}
