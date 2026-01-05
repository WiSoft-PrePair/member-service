import { Inject, Injectable, Logger } from "@nestjs/common";
import { MemberPasswordChangedEvent } from "@/domain/member";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadRepository,
} from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/postgresql";

@Injectable()
@EventsHandler(MemberPasswordChangedEvent)
export class MemberPasswordChangedEventHandler implements IEventHandler<MemberPasswordChangedEvent> {
  private readonly logger: Logger = new Logger(
    MemberPasswordChangedEventHandler.name,
  );
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    private readonly em: EntityManager,
  ) {}

  async handle(event: MemberPasswordChangedEvent) {
    this.logger.log(`비밀번호 변경 이벤트 시작: ${event.memberId}`);

    const entity = await this.memberReadRepository.findById(event.memberId);

    if (!entity) {
      this.logger.warn(`회원 Read Entity를 찾을 수 없음: ${event.memberId}`);
      return;
    }

    entity.password = event.newPasswordHash;
    entity.updatedAt = event.occurredAt;

    await this.em.flush();

    this.logger.log(`비밀번호 변경 이벤트 종료: ${event.memberId}`);
  }
}
