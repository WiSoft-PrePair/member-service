import { Inject, Injectable } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { MemberRegisterEvent } from "@/domain/member/events";
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/core";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

@Injectable()
@EventsHandler(MemberRegisterEvent)
export class MemberRegisterEventHandler
  implements IEventHandler<MemberRegisterEvent>
{
  constructor(
    private readonly em: EntityManager,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async handle(event: MemberRegisterEvent): Promise<void> {
    this.logger.log("Member register event handling started", {
      module: "MemberRegisterEventHandler",
      memberId: event.memberId,
      email: event.email,
    });

    try {
      const em: EntityManager = this.em.fork();

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

      this.logger.log("Member register event handling completed", {
        module: "MemberRegisterEventHandler",
        memberId: event.memberId,
      });
    } catch (error) {
      this.logger.error(
        "Member register event handling failed",
        error instanceof Error ? error : undefined,
        {
          module: "MemberRegisterEventHandler",
          memberId: event.memberId,
        },
      );
      throw error;
    }
  }
}
