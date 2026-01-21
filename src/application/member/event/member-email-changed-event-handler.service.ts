import { Inject, Injectable } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { MemberEmailChangedEvent } from "@/domain/member";
import { EntityManager } from "@mikro-orm/postgresql";
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";
import {
  MEMBER_READ_REPOSITORY,
  MemberReadDto,
  type MemberReadRepository,
} from "@/application/member/ports";

@Injectable()
@EventsHandler(MemberEmailChangedEvent)
export class MemberEmailChangedEventHandler implements IEventHandler<MemberEmailChangedEvent> {
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async handle(event: MemberEmailChangedEvent) {
    this.logger.log("Email change event handling started", {
      module: "MemberEmailChangedEventHandler",
      memberId: event.memberId,
      newEmail: event.newEmail,
    });

    const entity: MemberReadDto | null =
      await this.memberReadRepository.findById(event.memberId);

    if (!entity) {
      this.logger.warn("Member read entity not found", {
        module: "MemberEmailChangedEventHandler",
        memberId: event.memberId,
      });
      return;
    }

    const updatedDto = new MemberReadDto({
      ...entity, // 기존 값 복사
      email: event.newEmail, // 이메일만 변경
      updatedAt: event.occurredAt,
    });

    this.memberReadRepository.save(updatedDto);

    this.logger.log("Email change event handling completed", {
      module: "MemberEmailChangedEventHandler",
      memberId: event.memberId,
    });
  }
}
