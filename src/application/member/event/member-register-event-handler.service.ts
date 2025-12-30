import { Inject, Injectable, Logger } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { MemberRegisterEvent } from "@/domain/member/events";
import {
  MEMBER_READ_REPOSITORY,
  MemberReadEntity,
  type MemberReadRepository,
} from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/core";

@Injectable()
@EventsHandler(MemberRegisterEvent)
export class MemberRegisterEventHandler implements IEventHandler<MemberRegisterEvent> {
  private readonly logger: Logger = new Logger(MemberRegisterEventHandler.name);

  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    private readonly em: EntityManager,
  ) {}

  handle(event: MemberRegisterEvent): void {
    this.logger.log(`회원가입 이벤트 시작: ${event.memberId}`);

    const readEntity = new MemberReadEntity();
    readEntity.id = event.memberId;
    readEntity.email = event.email;
    readEntity.job = event.job;
    readEntity.nickname = event.nickname;
    readEntity.notification = event.notification;
    readEntity.frequency = event.frequency;
    readEntity.point = 0;
    readEntity.isPro = false;
    readEntity.createdAt = event.occurredAt;
    readEntity.updatedAt = event.occurredAt;
    readEntity.password = event.password;

    this.memberReadRepository.save(readEntity);

    this.logger.log(`회원가입 이벤트 종료: ${event.memberId}`);
  }
}
