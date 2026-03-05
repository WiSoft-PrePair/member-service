import { IQuery, IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { Inject, Injectable } from "@nestjs/common";
import {
  MEMBER_READ_REPOSITORY,
  MemberReadDto,
  type MemberReadRepository,
} from "@/application/member/ports";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

export class GetMembersQuery implements IQuery {
  constructor(
    public readonly limit: number = 20,
    public readonly offset: number = 0,
  ) {}
}

export class MemberSummary {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly job: string,
    public readonly nickname: string,
    public readonly notification: string,
    public readonly frequency: string,
    public readonly point: number,
    public readonly isPro: boolean,
    public readonly activity: string[] = [],
    public readonly kakaoAccessToken: string | null = null,
  ) {}
}
export class GetMembersResult {
  constructor(
    public readonly members: MemberSummary[],
    public readonly total: number,
    public readonly limit: number,
    public readonly offset: number,
  ) {}
}

@Injectable()
@QueryHandler(GetMembersQuery)
export class GetMembersHandler
  implements IQueryHandler<GetMembersQuery, GetMembersResult>
{
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async execute(query: GetMembersQuery): Promise<GetMembersResult> {
    this.logger.debug("Get members query started", {
      module: "GetMembersHandler",
      limit: query.limit,
      offset: query.offset,
    });

    const [members, total] = await Promise.all([
      this.memberReadRepository.findAll({
        limit: query.limit,
        offset: query.offset,
      }),
      this.memberReadRepository.countAll(),
    ]);

    return new GetMembersResult(
      members.map(
        (m: MemberReadDto) =>
          new MemberSummary(
            m.id,
            m.email,
            m.job,
            m.nickname,
            m.notification,
            m.frequency,
            m.point,
            m.isPro,
            m.activity,
            m.kakaoAccessToken ?? null,
          ),
      ),
      total,
      query.limit,
      query.offset,
    );
  }
}
