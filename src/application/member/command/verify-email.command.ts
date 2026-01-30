import { CommandHandler, ICommand, ICommandHandler } from "@nestjs/cqrs";
import { Inject, Injectable } from "@nestjs/common";
import { EmailVerificationService } from "@/application/member";
import { InvalidVerificationCodeException } from "@/domain/member";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

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
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(command: VerifyEmailCommand): Promise<{ verified: boolean }> {
    const { email, code } = command;

    this.logger.debug("Email verification started", {
      module: "VerifyEmailCommandHandler",
      email,
    });

    const verified: boolean = this.emailVerificationService.verifyCode(
      email,
      code,
    );

    if (!verified) {
      throw new InvalidVerificationCodeException();
    }

    this.logger.log("Email verification completed", {
      module: "VerifyEmailCommandHandler",
      email,
    });

    return { verified: true };
  }
}
