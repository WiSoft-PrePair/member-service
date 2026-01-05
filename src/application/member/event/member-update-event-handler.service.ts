import { Injectable, Logger } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { MemberUpdateEvent } from "@/domain/member";
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/postgresql";

@Injectable()
@EventsHandler(MemberUpdateEvent)
export class MemberUpdateEventHandler implements IEventHandler<MemberUpdateEvent> {
  private readonly logger: Logger = new Logger(MemberUpdateEventHandler.name);

  constructor(private readonly em: EntityManager) {}

  async handle(event: MemberUpdateEvent) {
    this.logger.log(`회원정보 수정 이벤트 시작: ${event.memberId}`);

    const entity: MemberReadEntity = this.em.getReference(
      MemberReadEntity,
      event.memberId,
    );

    entity.email = event.email;
    entity.password = event.password;
    entity.job = event.job;
    entity.nickname = event.nickname;
    entity.notification = event.notification;
    entity.frequency = event.frequency;
    entity.point = event.point;
    entity.isPro = event.isPro;
    entity.updatedAt = event.occurredAt;

    await this.em.flush();

    this.logger.log(`회원정보 수정 이벤트 종료: ${event.memberId}`);
  }
}
