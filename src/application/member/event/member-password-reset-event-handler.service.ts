import { Inject, Injectable } from "@nestjs/common";
import { MemberPasswordResetEvent } from "@/domain/member/events/member-password-reset.event";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/postgresql";

@Injectable()
@EventsHandler(MemberPasswordResetEvent)
export class MemberPasswordResetEventHandler implements IEventHandler<MemberPasswordResetEvent> {
  constructor(
    private readonly em: EntityManager,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async handle(event: MemberPasswordResetEvent) {
    this.logger.log("Password reset event handling started", {
      module: "MemberPasswordResetEventHandler",
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
          module: "MemberPasswordResetEventHandler",
          memberId: event.memberId,
        });
        return;
      }

      entity.updatedAt = event.occurredAt;

      await em.flush();

      this.logger.log("Password reset event handling completed", {
        module: "MemberPasswordResetEventHandler",
        memberId: event.memberId,
      });
    } catch (error) {
      this.logger.error(
        "Password reset event handling failed",
        error instanceof Error ? error : undefined,
        {
          module: "MemberPasswordResetEventHandler",
          memberId: event.memberId,
        },
      );
      throw error;
    }
  }
}
