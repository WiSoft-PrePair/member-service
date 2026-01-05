import { Injectable, Logger } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { MemberWithdrawEvent } from "@/domain/member/events";
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/core";

@Injectable()
@EventsHandler(MemberWithdrawEvent)
export class MemberWithdrawEventHandler
  implements IEventHandler<MemberWithdrawEvent>
{
  private readonly logger: Logger = new Logger(MemberWithdrawEventHandler.name);

  constructor(private readonly em: EntityManager) {}

  async handle(event: MemberWithdrawEvent) {
    this.logger.log(`회원탈퇴 이벤트 시작: ${event.memberId}`);

    const em = this.em.fork();

    const entity: MemberReadEntity | null = await em.findOne(MemberReadEntity, {
      id: event.memberId,
    });

    if (!entity) {
      this.logger.warn(`회원 Read Entity를 찾을 수 없음: ${event.memberId}`);
      return;
    }

    await em.removeAndFlush(entity);

    this.logger.log(`회원탈퇴 이벤트 종료: ${event.memberId}`);
  }
}
