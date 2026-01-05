import { CommandHandler, ICommand, ICommandHandler } from "@nestjs/cqrs";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  EmailAlreadyExistsException,
  Member,
  MEMBER_REPOSITORY,
  type MemberRepository,
} from "@/domain/member";
import { EmailVerificationService } from "@/application/member/service/email-verification.service";
import {
  EMAIL_SERVICE,
  type EmailService,
} from "@/application/member/service/email.service";
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadRepository,
} from "@/adapter/member/persistence/read";

export class RequestChangeEmailCommand implements ICommand {
  constructor(
    public readonly memberId: string,
    public readonly newEmail: string,
  ) {}
}

@Injectable()
@CommandHandler(RequestChangeEmailCommand)
export class RequestChangeEmailCommandHandler
  implements ICommandHandler<RequestChangeEmailCommand, void>
{
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    private readonly emailVerificationService: EmailVerificationService,
    @Inject(EMAIL_SERVICE)
    private readonly emailService: EmailService,
  ) {}

  async execute(command: RequestChangeEmailCommand): Promise<void> {
    // 1. 회원 존재 확인
    const existMember: Member | null = await this.memberRepository.findById(
      command.memberId,
    );

    if (!existMember) {
      throw new NotFoundException("회원을 찾을 수 없습니다.");
    }

    // 2. 이메일 중복 확인
    const emailExists = await this.memberReadRepository.findByEmail(
      command.newEmail,
    );

    if (emailExists) {
      throw new EmailAlreadyExistsException(command.newEmail);
    }

    // 3. 인증 코드 생성 및 저장
    const verificationCode = this.emailVerificationService.saveVerificationCode(
      command.memberId,
      command.newEmail,
    );

    // 4. 이메일 발송
    await this.emailService.sendVerificationCode(
      command.newEmail,
      verificationCode.value,
    );
  }
}
