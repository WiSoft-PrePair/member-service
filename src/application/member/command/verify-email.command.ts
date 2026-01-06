import { CommandHandler, ICommand, ICommandHandler } from "@nestjs/cqrs";
import { Injectable } from "@nestjs/common";
import { EmailVerificationService } from "@/application/member";
import {
  InvalidVerificationCodeException,
  VerificationToken,
} from "@/domain/member";

export class VerifyEmailCommand implements ICommand {
  constructor(
    public readonly email: string,
    public readonly code: string,
  ) {}
}

@Injectable()
@CommandHandler(VerifyEmailCommand)
export class VerifyEmailCommandHandler implements ICommandHandler<
  VerifyEmailCommand,
  string
> {
  constructor(
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(command: VerifyEmailCommand): Promise<string> {
    const { email, code } = command;

    const token: VerificationToken | null =
      this.emailVerificationService.verifyCode(email, code);

    if (!token) {
      throw new InvalidVerificationCodeException();
    }

    return token.getValue(); // 검증 토큰 반환
  }
}
