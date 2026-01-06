import { Injectable, Logger } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { MemberRegisterEvent } from "@/domain/member/events";
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/core";

@Injectable()
@EventsHandler(MemberRegisterEvent)
export class MemberRegisterEventHandler
  implements IEventHandler<MemberRegisterEvent>
{
  private readonly logger: Logger = new Logger(MemberRegisterEventHandler.name);

  constructor(private readonly em: EntityManager) {}

  async handle(event: MemberRegisterEvent): Promise<void> {
    this.logger.log(`회원가입 이벤트 시작: ${event.memberId}`);

    const em = this.em.fork();

    const readEntity = new MemberReadEntity();
    readEntity.id = event.memberId;
    readEntity.email = event.email;
    readEntity.job = event.job;
    readEntity.nickname = event.nickname;
    readEntity.notification = event.notification;
    readEntity.frequency = event.frequency;
    readEntity.point = 0;
    readEntity.isPro = false;
    readEntity.createdAt = event.occurredAt;
    readEntity.updatedAt = event.occurredAt;

    em.persist(readEntity);
    await em.flush();

    this.logger.log(`회원가입 이벤트 종료: ${event.memberId}`);
  }
}
