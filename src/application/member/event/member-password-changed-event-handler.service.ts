import { Inject, Injectable } from "@nestjs/common";
import { MemberPasswordChangedEvent } from "@/domain/member";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/postgresql";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

@Injectable()
@EventsHandler(MemberPasswordChangedEvent)
export class MemberPasswordChangedEventHandler implements IEventHandler<MemberPasswordChangedEvent> {
  constructor(
    private readonly em: EntityManager,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async handle(event: MemberPasswordChangedEvent) {
    this.logger.log("Password change event handling started", {
      module: "MemberPasswordChangedEventHandler",
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
          module: "MemberPasswordChangedEventHandler",
          memberId: event.memberId,
        });
        return;
      }

      entity.updatedAt = event.occurredAt;

      await em.flush();

      this.logger.log("Password change event handling completed", {
        module: "MemberPasswordChangedEventHandler",
        memberId: event.memberId,
      });
    } catch (error) {
      this.logger.error(
        "Password change event handling failed",
        error instanceof Error ? error : undefined,
        {
          module: "MemberPasswordChangedEventHandler",
          memberId: event.memberId,
        },
      );
      throw error;
    }
  }
}
