import { Injectable, Logger } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { MemberEmailChangedEvent } from "@/domain/member";
import { EntityManager } from "@mikro-orm/postgresql";
import { MemberReadEntity } from "@/adapter/member/persistence/read";

@Injectable()
@EventsHandler(MemberEmailChangedEvent)
export class MemberEmailChangedEventHandler
  implements IEventHandler<MemberEmailChangedEvent>
{
  private readonly logger: Logger = new Logger(
    MemberEmailChangedEventHandler.name,
  );

  constructor(private readonly em: EntityManager) {}

  async handle(event: MemberEmailChangedEvent) {
    this.logger.log(`이메일 변경 이벤트 시작: ${event.memberId}`);

    const em: EntityManager = this.em.fork();

    const entity: MemberReadEntity | null = await em.findOne(MemberReadEntity, {
      id: event.memberId,
    });

    if (!entity) {
      this.logger.warn(
        `회원 Read Entity를 찾을 수 없습니다: ${event.memberId}`,
      );
      return;
    }

    entity.email = event.newEmail;
    entity.updatedAt = event.occurredAt;

    await em.flush();

    this.logger.log(`이메일 변경 이벤트 종료: ${event.memberId}`);
  }
}
