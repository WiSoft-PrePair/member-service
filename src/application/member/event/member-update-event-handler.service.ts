import { Inject, Injectable } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { MemberUpdateEvent } from "@/domain/member";
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/postgresql";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";
import {
  MEMBER_READ_REPOSITORY,
  MemberReadDto,
  type MemberReadRepository,
} from "@/application/member/ports";

@Injectable()
@EventsHandler(MemberUpdateEvent)
export class MemberUpdateEventHandler implements IEventHandler<MemberUpdateEvent> {
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async handle(event: MemberUpdateEvent) {
    this.logger.log("Member update event handling started", {
      module: "MemberUpdateEventHandler",
      memberId: event.memberId,
    });

    const entity: MemberReadDto | null =
      await this.memberReadRepository.findById(event.memberId);

    if (!entity) {
      this.logger.warn("Member read entity not found", {
        module: "MemberUpdateEventHandler",
        memberId: event.memberId,
      });
      return;
    }

    const updatedDto = new MemberReadDto({
      id: entity.id,
      email: event.email,
      job: event.job,
      nickname: event.nickname,
      notification: event.notification,
      frequency: event.frequency,
      point: event.point,
      isPro: event.isPro,
      createdAt: entity.createdAt,
      updatedAt: event.occurredAt,
      activity: entity.activity,
    });

    this.memberReadRepository.save(updatedDto);

    this.logger.log("Member update event handling completed", {
      module: "MemberUpdateEventHandler",
      memberId: event.memberId,
    });
  }
}
