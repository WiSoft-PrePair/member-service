import { CommandHandler, ICommand, ICommandHandler } from "@nestjs/cqrs";
import { Inject, Injectable } from "@nestjs/common";
import {
  MEMBER_READ_REPOSITORY,
  MemberReadEntity,
  type MemberReadRepository,
} from "@/adapter/member/persistence/read";
import {
  EMAIL_SERVICE,
  type EmailService,
  EmailVerificationService,
} from "@/application/member";
import { EmailAlreadyExistsException, VerificationCode } from "@/domain/member";

export type EmailVerificationPurpose = "REGISTER" | "CHANGE_EMAIL";

export class SendEmailVerificationCommand implements ICommand {
  constructor(
    public readonly email: string,
    public readonly purpose: EmailVerificationPurpose,
  ) {}
}

@Injectable()
@CommandHandler(SendEmailVerificationCommand)
export class SendEmailVerificationCommandHandler implements ICommandHandler<
  SendEmailVerificationCommand,
  void
> {
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    private readonly emailVerificationService: EmailVerificationService,
    @Inject(EMAIL_SERVICE)
    private readonly emailService: EmailService,
  ) {}

  async execute(command: SendEmailVerificationCommand): Promise<void> {
    const { email } = command;

    const existMember: MemberReadEntity | null =
      await this.memberReadRepository.findByEmail(email);

    if (existMember) {
      throw new EmailAlreadyExistsException(email);
    }

    const code: VerificationCode =
      this.emailVerificationService.saveVerificationCode(email);

    await this.emailService.sendVerificationCode(email, code.value);
  }
}
