import { CommandHandler, ICommand, ICommandHandler } from "@nestjs/cqrs";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadRepository,
} from "@/application/member/ports";
import {
  EMAIL_SERVICE,
  type EmailService,
  EmailVerificationService,
} from "@/application/member";
import { EmailAlreadyExistsException, VerificationCode } from "@/domain/member";

export type EmailVerificationPurpose =
  | "REGISTER"
  | "CHANGE_EMAIL"
  | "PASSWORD_RESET";

export class SendEmailVerificationCommand implements ICommand {
  constructor(
    public readonly email: string,
    public readonly purpose: EmailVerificationPurpose,
  ) {}
}

@Injectable()
@CommandHandler(SendEmailVerificationCommand)
export class SendEmailVerificationCommandHandler
  implements ICommandHandler<SendEmailVerificationCommand, void>
{
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    private readonly emailVerificationService: EmailVerificationService,
    @Inject(EMAIL_SERVICE)
    private readonly emailService: EmailService,
  ) {}

  async execute(command: SendEmailVerificationCommand): Promise<void> {
    const { email, purpose } = command;

    const existMember: MemberReadEntity | null =
      await this.memberReadRepository.findByEmail(email);

    if (purpose === "PASSWORD_RESET") {
      if (!existMember) {
        throw new NotFoundException(email);
      }
    } else {
      if (existMember) {
        throw new EmailAlreadyExistsException(email);
      }
    }

    const code: VerificationCode =
      this.emailVerificationService.saveVerificationCode(email);

    await this.emailService.sendVerificationCode(email, code.value);
  }
}
