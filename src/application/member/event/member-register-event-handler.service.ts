import { Inject, Injectable } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { UniqueConstraintViolationException } from "@mikro-orm/core";
import { MemberRegisterEvent } from "@/domain/member/events";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";
import {
  MEMBER_READ_REPOSITORY,
  MemberReadDto,
  type MemberReadRepository,
} from "@/application/member/ports";

@Injectable()
@EventsHandler(MemberRegisterEvent)
export class MemberRegisterEventHandler
  implements IEventHandler<MemberRegisterEvent>
{
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async handle(event: MemberRegisterEvent): Promise<void> {
    this.logger.log("Member register event handling started", {
      module: "MemberRegisterEventHandler",
      memberId: event.memberId,
      email: event.email,
    });

    try {
      // 멱등성 보장: 이미 존재하는 경우 스킵
      const existing = await this.memberReadRepository.findById(event.memberId);
      if (existing) {
        this.logger.warn("Member read entity already exists, skipping", {
          module: "MemberRegisterEventHandler",
          memberId: event.memberId,
        });
        return;
      }

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
      // Race condition으로 인한 중복 INSERT는 무시 (멱등성 보장)
      if (error instanceof UniqueConstraintViolationException) {
        this.logger.warn("Member read entity already exists (race condition), skipping", {
          module: "MemberRegisterEventHandler",
          memberId: event.memberId,
        });
        return;
      }

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
