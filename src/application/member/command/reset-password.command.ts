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
  temporaryPassword: string;
}

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

    const tempPassword: string = this.generateTemporaryPassword();

    const updatedMember: Member = existMember.resetPassword(
      tempPassword,
      this.passwordEncoder,
    );

    this.memberRepository.update(updatedMember);

    for (const event of updatedMember.getDomainEvents()) {
      this.eventStore.append(event);
    }

    await this.em.flush();

    this.eventBus.publish(
      new MemberPasswordResetEvent(updatedMember.id, tempPassword),
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
      temporaryPassword: tempPassword,
    };
  }

  private generateTemporaryPassword() {
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const special = "!@#$%^&*";
    const all = uppercase + lowercase + numbers + special;

    // 최소 조건 만족 (대문자 1, 소문자 1, 숫자 1, 특수문자 1)
    let password: string = "";
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // 나머지 4자리 랜덤
    for (let i = 0; i < 4; i++) {
      password += all[Math.floor(Math.random() * all.length)];
    }

    // 셔플 (순서 예측 방지)
    return password
      .split("")
      .sort(() => Math.random() - 0.5)
      .join("");
  }
}
