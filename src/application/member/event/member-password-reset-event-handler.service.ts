import { Injectable } from "@nestjs/common";
import { MemberPasswordResetEvent } from "@/domain/member/events/member-password-reset.event";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { EntityManager } from "@mikro-orm/postgresql";
import { MemberReadEntity } from "@/adapter/member/persistence/read";

@Injectable()
@EventsHandler(MemberPasswordResetEvent)
export class MemberPasswordResetEventHandler
  implements IEventHandler<MemberPasswordResetEvent>
{
  constructor(private readonly em: EntityManager) {}

  async handle(event: MemberPasswordResetEvent) {
    const em: EntityManager = this.em.fork();

    const entity: MemberReadEntity | null = await em.findOne(MemberReadEntity, {
      id: event.memberId,
    });

    if (!entity) {
      return;
    }

    entity.updatedAt = event.occurredAt;

    await em.flush();
  }
}
