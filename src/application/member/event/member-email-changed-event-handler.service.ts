import { Inject, Injectable } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { MemberEmailChangedEvent } from "@/domain/member";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/postgresql";

@Injectable()
@EventsHandler(MemberEmailChangedEvent)
export class MemberEmailChangedEventHandler implements IEventHandler<MemberEmailChangedEvent> {
  constructor(
    private readonly em: EntityManager,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async handle(event: MemberEmailChangedEvent) {
    this.logger.log("Email change event handling started", {
      module: "MemberEmailChangedEventHandler",
      memberId: event.memberId,
      newEmail: event.newEmail,
    });

    try {
      const em: EntityManager = this.em.fork();

      const entity: MemberReadEntity | null = await em.findOne(
        MemberReadEntity,
        { id: event.memberId },
      );

      if (!entity) {
        this.logger.warn("Member read entity not found", {
          module: "MemberEmailChangedEventHandler",
          memberId: event.memberId,
        });
        return;
      }

      entity.email = event.newEmail;
      entity.updatedAt = event.occurredAt;

      await em.flush();

      this.logger.log("Email change event handling completed", {
        module: "MemberEmailChangedEventHandler",
        memberId: event.memberId,
      });
    } catch (error) {
      this.logger.error(
        "Email change event handling failed",
        error instanceof Error ? error : undefined,
        {
          module: "MemberEmailChangedEventHandler",
          memberId: event.memberId,
        },
      );
      throw error;
    }
  }
}
