import { Inject, Injectable } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { MemberWithdrawEvent } from "@/domain/member/events";
import {
  type OauthRepository,
  OAUTH_REPOSITORY,
} from "@/domain/oauth/oauth.repository";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

@Injectable()
@EventsHandler(MemberWithdrawEvent)
export class MemberWithdrawOAuthCleanupHandler
  implements IEventHandler<MemberWithdrawEvent>
{
  constructor(
    @Inject(OAUTH_REPOSITORY)
    private readonly oauthRepository: OauthRepository,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async handle(event: MemberWithdrawEvent) {
    this.logger.log("Cleaning up OAuth connections for withdrawn member", {
      module: "MemberWithdrawOAuthCleanupHandler",
      memberId: event.memberId,
    });

    try {
      await this.oauthRepository.disconnectAllByMemberId(event.memberId);

      this.logger.log("OAuth connections cleanup completed", {
        module: "MemberWithdrawOAuthCleanupHandler",
        memberId: event.memberId,
      });
    } catch (error) {
      this.logger.error(
        "Failed to clean up OAuth connections",
        error instanceof Error ? error : undefined,
        {
          module: "MemberWithdrawOAuthCleanupHandler",
          memberId: event.memberId,
        },
      );
      throw error;
    }
  }
}
