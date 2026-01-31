import { Inject, Injectable } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { MemberLoginEvent } from "@/domain/member";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/postgresql";

@Injectable()
@EventsHandler(MemberLoginEvent)
export class MemberLoginEventHandler
  implements IEventHandler<MemberLoginEvent>
{
  constructor(
    private readonly em: EntityManager,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async handle(event: MemberLoginEvent) {
    this.logger.log("Member login event handling started", {
      module: "MemberLoginEventHandler",
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
          module: "MemberLoginEventHandler",
          memberId: event.memberId,
        });
        return;
      }

      const today: string = event.loginAt.toISOString().slice(0, 10);
      const activity: string[] = entity.activity ?? [];

      if (!activity.includes(today)) {
        entity.activity = [...activity, today];

        await em.flush();

        this.logger.log("Member login event handling completed", {
          module: "MemberLoginEventHandler",
          memberId: event.memberId,
        });
      }
    } catch (error) {
      this.logger.error(
        "Member login event handling failed",
        error instanceof Error ? error : undefined,
        {
          module: "MemberLoginEventHandler",
          memberId: event.memberId,
        },
      );
      throw error;
    }
  }
}
