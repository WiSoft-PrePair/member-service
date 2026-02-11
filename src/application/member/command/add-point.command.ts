import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from "@nestjs/cqrs";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  Member,
  MEMBER_REPOSITORY,
  type MemberRepository,
  MemberUpdateEvent,
} from "@/domain/member";
import { EVENT_STORE, type EventStore } from "@/domain/shared";
import { EntityManager } from "@mikro-orm/postgresql";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";
import { Transactional } from "@mikro-orm/core";

export class AddPointCommand implements ICommand {
  constructor(
    public readonly memberId: string,
    public readonly point: number,
  ) {}
}

@Injectable()
@CommandHandler(AddPointCommand)
export class AddPointCommandHandler implements ICommandHandler<
  AddPointCommand,
  void
> {
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(EVENT_STORE)
    private readonly eventStore: EventStore,
    private readonly eventBus: EventBus,
    private readonly em: EntityManager,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  @Transactional()
  async execute(command: AddPointCommand): Promise<void> {
    const member: Member | null = await this.memberRepository.findById(
      command.memberId,
    );

    if (!member) {
      throw new NotFoundException("회원을 찾을 수 없습니다.");
    }

    const updatedMember: Member = member.addPoint(command.point);

    await this.memberRepository.update(updatedMember);

    for (const domainEvent of updatedMember.getDomainEvents()) {
      this.eventStore.append(domainEvent);
    }

    await this.em.flush();

    this.eventBus.publish(
      new MemberUpdateEvent(
        updatedMember.id,
        updatedMember.email.value,
        updatedMember.password.value,
        updatedMember.job,
        updatedMember.nickname,
        updatedMember.notification,
        updatedMember.frequency,
        updatedMember.point,
        updatedMember.isPro,
      ),
    );

    updatedMember.clearDomainEvents();
  }
}
