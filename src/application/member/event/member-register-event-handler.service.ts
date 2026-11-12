import { Inject, Injectable } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { UniqueConstraintViolationException } from "@mikro-orm/core";
import { MemberRegisterEvent } from "@/domain/member/events";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/postgresql";

@Injectable()
@EventsHandler(MemberRegisterEvent)
export class MemberRegisterEventHandler
  implements IEventHandler<MemberRegisterEvent>
{
  constructor(
    private readonly em: EntityManager,
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
      const em: EntityManager = this.em.fork();

      // 멱등성 보장: 이미 존재하는 경우 스킵
      const existing: MemberReadEntity | null = await em.findOne(
        MemberReadEntity,
        {
          id: event.memberId,
        },
      );

      if (existing) {
        this.logger.warn("Member read entity already exists, skipping", {
          module: "MemberRegisterEventHandler",
          memberId: event.memberId,
        });
        return;
      }

      const entity = new MemberReadEntity();
      entity.id = event.memberId;
      entity.email = event.email;
      entity.job = event.job;
      entity.nickname = event.nickname;
      entity.point = 0;
      entity.isPro = false;
      entity.createdAt = event.occurredAt;
      entity.updatedAt = event.occurredAt;

      em.persist(entity);
      await em.flush();

      this.logger.log("Member register event handling completed", {
        module: "MemberRegisterEventHandler",
        memberId: event.memberId,
      });
    } catch (error) {
      // Race condition으로 인한 중복 INSERT는 무시 (멱등성 보장)
      if (error instanceof UniqueConstraintViolationException) {
        this.logger.warn(
          "Member read entity already exists (race condition), skipping",
          {
            module: "MemberRegisterEventHandler",
            memberId: event.memberId,
          },
        );
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
