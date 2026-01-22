import { Inject, Injectable } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { MemberLoginEvent } from "@/domain/member";
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadRepository,
} from "@/application/member/ports";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

@Injectable()
@EventsHandler(MemberLoginEvent)
export class MemberLoginEventHandler
  implements IEventHandler<MemberLoginEvent>
{
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async handle(event: MemberLoginEvent) {
    this.logger.log("Member login event handling started", {
      module: "MemberLoginEventHandler",
      memberId: event.memberId,
    });

    const entity = await this.memberReadRepository.findById(event.memberId);

    if (entity) {
      const today: string = event.loginAt.toISOString().slice(0, 10);
      const activity: string[] = entity.activity ?? [];

      if (!activity.includes(today)) {
        activity.push(today);

        this.memberReadRepository.save({
          ...entity,
          activity,
        });

        this.logger.log("Member logged in event handling completed", {
          module: "MemberLoggedInEventHandler",
          memberId: event.memberId,
        });
      }
    }
  }
}
