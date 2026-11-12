import { Inject, Injectable } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { MemberUpdateEvent } from "@/domain/member";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/postgresql";

@Injectable()
@EventsHandler(MemberUpdateEvent)
export class MemberUpdateEventHandler
  implements IEventHandler<MemberUpdateEvent>
{
  constructor(
    private readonly em: EntityManager,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async handle(event: MemberUpdateEvent) {
    this.logger.log("Member update event handling started", {
      module: "MemberUpdateEventHandler",
      memberId: event.memberId,
    });

    try {
      const em: EntityManager = this.em.fork();

      const entity: MemberReadEntity | null = await em.findOne(
        MemberReadEntity,
        { id: event.memberId },
      );

      if (!entity) {
        this.logger.warn("Member read entity not found", {
          module: "MemberUpdateEventHandler",
          memberId: event.memberId,
        });
        return;
      }

      entity.email = event.email;
      entity.job = event.job;
      entity.nickname = event.nickname;
      entity.point = event.point;
      entity.isPro = event.isPro;
      entity.updatedAt = event.occurredAt;

      await em.flush();

      this.logger.log("Member update event handling completed", {
        module: "MemberUpdateEventHandler",
        memberId: event.memberId,
      });
    } catch (error) {
      this.logger.error(
        "Member update event handling failed",
        error instanceof Error ? error : undefined,
        {
          module: "MemberUpdateEventHandler",
          memberId: event.memberId,
        },
      );
      throw error;
    }
  }
}
