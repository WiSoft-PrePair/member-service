import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from "@nestjs/cqrs";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { MEMBER_REPOSITORY, type MemberRepository } from "@/domain/member";
import {
  createDomainEvent,
  EVENT_STORE,
  type EventStore,
} from "@/domain/shared";
import { EntityManager } from "@mikro-orm/core";
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadRepository,
} from "@/application/member/ports";
import { MemberWithdrawEvent } from "@/domain/member/events";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

export class MemberWithdrawCommand implements ICommand {
  constructor(public readonly id: string) {}
}

@Injectable()
@CommandHandler(MemberWithdrawCommand)
export class WithdrawMemberCommandHandler
  implements ICommandHandler<MemberWithdrawCommand, string>
{
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    @Inject(EVENT_STORE)
    private readonly eventStore: EventStore,
    private readonly eventBus: EventBus,
    private readonly em: EntityManager,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async execute(command: MemberWithdrawCommand): Promise<string> {
    this.logger.log("Member withdrawal started", {
      module: "WithdrawMemberCommandHandler",
      memberId: command.id,
    });

    const member: MemberReadEntity | null =
      await this.memberReadRepository.findById(command.id);

    if (!member) {
      throw new NotFoundException("회원을 찾을 수 없습니다.");
    }

    this.memberRepository.withdraw(command.id);

    this.eventStore.append(
      createDomainEvent(command.id, "MemberWithdraw", { id: command.id }),
    );

    await this.em.flush();

    this.eventBus.publish(new MemberWithdrawEvent(command.id));

    this.logger.log("Member withdrawal completed", {
      module: "WithdrawMemberCommandHandler",
      memberId: member.id,
    });

    return member.id;
  }
}
