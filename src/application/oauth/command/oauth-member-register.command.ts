import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from "@nestjs/cqrs";
import {
  OAUTH_REPOSITORY,
  OAuthConnection,
  OAuthProvider,
  type OauthRepository,
} from "@/domain/oauth";
import {
  FrequencyEnum,
  Member,
  MEMBER_REPOSITORY,
  MemberRegisterEvent,
  type MemberRepository,
  NotificationEnum,
  PASSWORD_ENCODER,
  type PasswordEncoder,
} from "@/domain/member";
import { Inject, Injectable } from "@nestjs/common";
import {
  createDomainEvent,
  EVENT_STORE,
  type EventStore,
} from "@/domain/shared";
import { EntityManager } from "@mikro-orm/postgresql";
import { Transactional } from "@mikro-orm/core";
import { randomUUID } from "crypto";

export class OAuthMemberRegisterCommand implements ICommand {
  constructor(
    public readonly email: string,
    public readonly nickname: string,
    public readonly provider: OAuthProvider,
    public readonly providerId: string,
    public readonly job: string,
    public readonly notification: NotificationEnum,
    public readonly frequency: FrequencyEnum,
  ) {}
}

export interface OAuthMemberRegisterCommandResult {
  memberId: string;
  member: Member;
}

@Injectable()
@CommandHandler(OAuthMemberRegisterCommand)
export class OAuthMemberRegisterCommandHandler implements ICommandHandler<
  OAuthMemberRegisterCommand,
  OAuthMemberRegisterCommandResult
> {
  constructor(
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(PASSWORD_ENCODER)
    private readonly passwordEncoder: PasswordEncoder,
    @Inject(OAUTH_REPOSITORY)
    private readonly oauthRepository: OauthRepository,
    @Inject(EVENT_STORE)
    private readonly eventStore: EventStore,
    private readonly eventBus: EventBus,
    private readonly em: EntityManager,
  ) {}

  @Transactional()
  async execute(
    command: OAuthMemberRegisterCommand,
  ): Promise<OAuthMemberRegisterCommandResult> {
    const tempPassword: string = randomUUID();

    const member: Member = Member.register(
      {
        email: command.email,
        password: tempPassword,
        nickname: command.nickname,
        job: command.job,
        notification: command.notification,
        frequency: command.frequency,
      },
      this.passwordEncoder,
    );

    this.memberRepository.register(member);

    const connection: OAuthConnection = OAuthConnection.connect({
      memberId: member.id,
      provider: command.provider,
      providerId: command.providerId,
      email: command.email,
    });
    this.oauthRepository.save(connection);

    this.eventStore.append(
      createDomainEvent(member.id, "MemberRegistered", {
        id: member.id,
        email: member.email.value,
        password: member.password.value,
        job: member.job,
        nickname: member.nickname,
        notification: member.notification,
        frequency: member.frequency,
        point: member.point,
        isPro: member.isPro,
        oauthProvider: command.provider,
        oauthProviderId: command.providerId,
      }),
    );

    await this.em.flush();

    this.eventBus.publish(
      new MemberRegisterEvent(
        member.id,
        member.email.value,
        member.password.value,
        member.job,
        member.nickname,
        member.notification,
        member.frequency,
      ),
    );

    return {
      memberId: member.id,
      member,
    };
  }
}
