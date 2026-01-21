import { Inject, Injectable } from "@nestjs/common";
import { MemberPasswordResetEvent } from "@/domain/member/events/member-password-reset.event";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { EntityManager } from "@mikro-orm/postgresql";
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";
import {
  MEMBER_READ_REPOSITORY,
  MemberReadDto,
  type MemberReadRepository,
} from "@/application/member/ports";

@Injectable()
@EventsHandler(MemberPasswordResetEvent)
export class MemberPasswordResetEventHandler implements IEventHandler<MemberPasswordResetEvent> {
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async handle(event: MemberPasswordResetEvent) {
    this.logger.log("Password reset event handling started", {
      module: "MemberPasswordResetEventHandler",
      memberId: event.memberId,
    });

    const entity: MemberReadDto | null =
      await this.memberReadRepository.findById(event.memberId);

    if (!entity) {
      this.logger.warn("Member read entity not found", {
        module: "MemberPasswordResetEventHandler",
        memberId: event.memberId,
      });
      return;
    }

    const updatedDto = new MemberReadDto({
      ...entity,
      updatedAt: event.occurredAt,
    });

    this.memberReadRepository.save(updatedDto);

    this.logger.log("Password reset event handling completed", {
      module: "MemberPasswordResetEventHandler",
      memberId: event.memberId,
    });
  }
}
