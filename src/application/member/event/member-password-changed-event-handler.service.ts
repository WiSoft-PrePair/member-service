import { Injectable, Logger } from "@nestjs/common";
import { MemberPasswordChangedEvent } from "@/domain/member";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/postgresql";

@Injectable()
@EventsHandler(MemberPasswordChangedEvent)
export class MemberPasswordChangedEventHandler
  implements IEventHandler<MemberPasswordChangedEvent>
{
  private readonly logger: Logger = new Logger(
    MemberPasswordChangedEventHandler.name,
  );
  constructor(private readonly em: EntityManager) {}

  async handle(event: MemberPasswordChangedEvent) {
    this.logger.log(`비밀번호 변경 이벤트 시작: ${event.memberId}`);

    const em = this.em.fork();

    const entity: MemberReadEntity | null = await em.findOne(MemberReadEntity, {
      id: event.memberId,
    });

    if (!entity) {
      this.logger.warn(`회원 Read Entity를 찾을 수 없음: ${event.memberId}`);
      return;
    }

    entity.updatedAt = event.occurredAt;

    await em.flush();

    this.logger.log(`비밀번호 변경 이벤트 종료: ${event.memberId}`);
  }
}
