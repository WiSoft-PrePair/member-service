import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from "@nestjs/cqrs";
import {
  FrequencyEnum,
  Member,
  MEMBER_REPOSITORY,
  type MemberRepository,
  MemberUpdateEvent,
  NotificationEnum,
} from "@/domain/member";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  createDomainEvent,
  EVENT_STORE,
  type EventStore,
} from "@/domain/shared";
import { EntityManager, Transactional } from "@mikro-orm/core";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

export class MemberUpdateCommand implements ICommand {
  constructor(
    public readonly id: string,
    public readonly job?: string,
    public readonly nickname?: string,
    public readonly notification?: NotificationEnum,
    public readonly frequency?: FrequencyEnum,
  ) {}
}

@Injectable()
@CommandHandler(MemberUpdateCommand)
export class MemberUpdateCommandHandler implements ICommandHandler<
  MemberUpdateCommand,
  string
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
  async execute(command: MemberUpdateCommand): Promise<string> {
    this.logger.log("Member update started", {
      module: "MemberUpdateCommandHandler",
      memberId: command.id,
      job: command.job,
      nickname: command.nickname,
    });

    const existingMember: Member | null = await this.memberRepository.findById(
      command.id,
    );

    if (!existingMember) {
      throw new NotFoundException("회원을 찾을 수 없습니다.");
    }

    const updatedMember: Member = existingMember.update({
      job: command.job ?? existingMember.job,
      nickname: command.nickname ?? existingMember.nickname,
      notification: command.notification ?? existingMember.notification,
      frequency: command.frequency ?? existingMember.frequency,
    });

    this.memberRepository.update(updatedMember);

    for (const event of updatedMember.getDomainEvents()) {
      this.eventStore.append(event);
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

    this.logger.log("Member update completed", {
      module: "MemberUpdateCommandHandler",
      memberId: updatedMember.id,
    });

    updatedMember.clearDomainEvents();

    return updatedMember.id;
  }
}
