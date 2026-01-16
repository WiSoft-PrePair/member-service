import { IQuery, IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadRepository,
} from "@/application/member";
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

export class GetMemberEmailResult {
  constructor(public readonly isEmailExists: boolean) {}
}

export class GetMemberEmailQuery implements IQuery {
  constructor(public readonly email: string) {}
}

@Injectable()
@QueryHandler(GetMemberEmailQuery)
export class GetMemberEmailQueryHandler
  implements IQueryHandler<GetMemberEmailQuery, GetMemberEmailResult>
{
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async execute(query: GetMemberEmailQuery): Promise<GetMemberEmailResult> {
    this.logger.debug("Get member email query started", {
      module: "GetMemberEmailQueryHandler",
      email: query.email,
    });

    try {
      const member: MemberReadEntity | null =
        await this.memberReadRepository.findByEmail(query.email);

      if (!member) {
        throw new NotFoundException(`해당 이메일을 가진 회원이 없습니다.`);
      }

      this.logger.debug("Get member email query completed", {
        module: "GetMemberEmailQueryHandler",
        email: query.email,
      });

      return new GetMemberEmailResult(true);
    } catch (error) {
      this.logger.error(
        "Get member email query failed",
        error instanceof Error ? error : undefined,
        {
          module: "GetMemberEmailQueryHandler",
          email: query.email,
        },
      );
      throw error;
    }
  }
}
