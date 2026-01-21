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
  MemberPasswordChangedEvent,
  type MemberRepository,
  PASSWORD_ENCODER,
  type PasswordEncoder,
} from "@/domain/member";
import { EVENT_STORE, type EventStore } from "@/domain/shared";
import { EntityManager } from "@mikro-orm/postgresql";
import { Transactional } from "@mikro-orm/core";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

export class ChangePasswordCommand implements ICommand {
  constructor(
    public readonly memberId: string,
    public readonly currentPassword: string,
    public readonly newPassword: string,
  ) {}
}

@Injectable()
@CommandHandler(ChangePasswordCommand)
export class ChangePasswordCommandHandler implements ICommandHandler<
  ChangePasswordCommand,
  string
> {
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(PASSWORD_ENCODER)
    private readonly passwordEncoder: PasswordEncoder,
    @Inject(EVENT_STORE)
    private readonly eventStore: EventStore,
    private readonly eventBus: EventBus,
    private readonly em: EntityManager,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  @Transactional()
  async execute(command: ChangePasswordCommand): Promise<string> {
    this.logger.log("Password change started", {
      module: "ChangePasswordCommandHandler",
      memberId: command.memberId,
    });

    const existMember: Member | null = await this.memberRepository.findById(
      command.memberId,
    );

    if (!existMember) {
      throw new NotFoundException("회원을 찾을 수 없습니다.");
    }

    const updateMember: Member = existMember.changePassword(
      command.currentPassword,
      command.newPassword,
      this.passwordEncoder,
    );

    this.memberRepository.update(updateMember);

    for (const event of updateMember.getDomainEvents()) {
      this.eventStore.append(event);
    }

    await this.em.flush();

    this.eventBus.publish(
      new MemberPasswordChangedEvent(
        updateMember.id,
        updateMember.password.value,
      ),
    );

    this.logger.log("Password change completed", {
      module: "ChangePasswordCommandHandler",
      memberId: updateMember.id,
    });

    updateMember.clearDomainEvents();

    return updateMember.id;
  }
}
