import { CommandHandler, ICommand, ICommandHandler } from "@nestjs/cqrs";
import { Injectable } from "@nestjs/common";
import { EmailVerificationService } from "@/application/member";
import { InvalidVerificationCodeException } from "@/domain/member";

export class VerifyEmailCommand implements ICommand {
  constructor(
    public readonly email: string,
    public readonly code: string,
  ) {}
}

@Injectable()
@CommandHandler(VerifyEmailCommand)
export class VerifyEmailCommandHandler
  implements ICommandHandler<VerifyEmailCommand, { verified: boolean }>
{
  constructor(
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(command: VerifyEmailCommand): Promise<{ verified: boolean }> {
    const { email, code } = command;

    const verified = this.emailVerificationService.verifyCode(email, code);

    if (!verified) {
      throw new InvalidVerificationCodeException();
    }

    return { verified: true };
  }
}
