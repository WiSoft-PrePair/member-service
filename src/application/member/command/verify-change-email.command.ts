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

export class VerifyChangeEmailCommand implements ICommand {
  constructor(
    public readonly memberId: string,
    public readonly code: string,
  ) {}
}

@Injectable()
@CommandHandler(VerifyChangeEmailCommand)
export class VerifyChangeEmailCommandHandler
  implements ICommandHandler<VerifyChangeEmailCommand, string>
{
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    private readonly emailVerificationService: EmailVerificationService,
    @Inject(EVENT_STORE)
    private readonly eventStore: EventStore,
    private readonly eventBus: EventBus,
    private readonly em: EntityManager,
  ) {}

  @Transactional()
  async execute(command: VerifyChangeEmailCommand): Promise<string> {
    // 1. 회원 조회
    const existMember: Member | null = await this.memberRepository.findById(
      command.memberId,
    );

    if (!existMember) {
      throw new NotFoundException("회원을 찾을 수 없습니다.");
    }

    // 2. 인증 코드 검증
    const newEmail = this.emailVerificationService.verifyCode(
      command.memberId,
      command.code,
    );

    if (!newEmail) {
      throw new InvalidVerificationCodeException();
    }

    // 3. 도메인 로직 실행 (이메일 변경)
    const updatedMember: Member = existMember.changeEmail(newEmail);

    // 4. Write Model 업데이트
    this.memberRepository.update(updatedMember);

    // 5. Event Store에 기록
    this.eventStore.append(
      createDomainEvent(updatedMember.id, "MemberEmailChanged", {
        id: updatedMember.id,
        newEmail: updatedMember.email.value,
        changedAt: new Date().toISOString(),
      }),
    );

    // 6. 트랜잭션 커밋
    await this.em.flush();

    // 7. 이벤트 발행
    this.eventBus.publish(
      new MemberEmailChangedEvent(updatedMember.id, updatedMember.email.value),
    );

    return updatedMember.email.value;
  }
}
