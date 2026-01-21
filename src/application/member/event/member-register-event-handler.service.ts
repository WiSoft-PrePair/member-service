import { Inject, Injectable } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { MemberRegisterEvent } from "@/domain/member/events";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";
import {
  MEMBER_READ_REPOSITORY,
  MemberReadDto,
  type MemberReadRepository,
} from "@/application/member/ports";

@Injectable()
@EventsHandler(MemberRegisterEvent)
export class MemberRegisterEventHandler implements IEventHandler<MemberRegisterEvent> {
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  // eslint-disable-next-line
  async handle(event: MemberRegisterEvent): Promise<void> {
    this.logger.log("Member register event handling started", {
      module: "MemberRegisterEventHandler",
      memberId: event.memberId,
      email: event.email,
    });

    try {
      const dto = new MemberReadDto({
        id: event.memberId,
        email: event.email,
        job: event.job,
        nickname: event.nickname,
        notification: event.notification,
        frequency: event.frequency,
        point: 0,
        isPro: false,
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
      });

      this.memberReadRepository.save(dto);

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
