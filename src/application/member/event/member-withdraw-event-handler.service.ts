import { Inject, Injectable, Logger } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { MemberWithdrawEvent } from "@/domain/member/events";
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadRepository,
} from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/core";

@Injectable()
@EventsHandler(MemberWithdrawEvent)
export class MemberWithdrawEventHandler
  implements IEventHandler<MemberWithdrawEvent>
{
  private readonly logger: Logger = new Logger(MemberWithdrawEventHandler.name);

  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    private readonly em: EntityManager,
  ) {}

  async handle(event: MemberWithdrawEvent) {
    this.logger.log(`회원탈퇴 이벤트 시작: ${event.memberId}`);

    this.memberReadRepository.withdraw(event.memberId);
    await this.em.flush();

    this.logger.log(`회원탈퇴 이벤트 종료: ${event.memberId}`);
  }
}
