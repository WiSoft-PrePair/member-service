import { Inject, Injectable } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { MemberWithdrawEvent } from "@/domain/member/events";
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/core";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

@Injectable()
@EventsHandler(MemberWithdrawEvent)
export class MemberWithdrawEventHandler
  implements IEventHandler<MemberWithdrawEvent>
{
  constructor(
    private readonly em: EntityManager,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async handle(event: MemberWithdrawEvent) {
    this.logger.log("Member withdraw event handling started", {
      module: "MemberWithdrawEventHandler",
      memberId: event.memberId,
    });

    try {
      const em = this.em.fork();

      const entity: MemberReadEntity | null = await em.findOne(
        MemberReadEntity,
        {
          id: event.memberId,
        },
      );

      if (!entity) {
        this.logger.warn("Member read entity not found", {
          module: "MemberWithdrawEventHandler",
          memberId: event.memberId,
        });
        return;
      }

      await em.removeAndFlush(entity);

      this.logger.log("Member withdraw event handling completed", {
        module: "MemberWithdrawEventHandler",
        memberId: event.memberId,
      });
    } catch (error) {
      this.logger.error(
        "Member withdraw event handling failed",
        error instanceof Error ? error : undefined,
        {
          module: "MemberWithdrawEventHandler",
          memberId: event.memberId,
        },
      );
      throw error;
    }
  }
}
