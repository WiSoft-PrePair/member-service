import { IQuery, IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  MEMBER_READ_REPOSITORY,
  MemberReadEntity,
  type MemberReadRepository,
} from "@/adapter/member/persistence/read";

export class GetMemberResult {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly job: string,
    public readonly nickname: string,
    public readonly notification: string,
    public readonly frequency: string,
    public readonly point: number,
    public readonly isPro: boolean,
    public readonly activity: string[]=[],
  ) {}
}

export class GetMemberQuery implements IQuery {
  constructor(public readonly memberId: string) {}
}

@Injectable()
@QueryHandler(GetMemberQuery)
export class GetMemberHandler implements IQueryHandler<
  GetMemberQuery,
  GetMemberResult
> {
  constructor(
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
  ) {}

  async execute(query: GetMemberQuery): Promise<GetMemberResult> {
    const member: MemberReadEntity | null =
      await this.memberReadRepository.findById(query.memberId);

    if (!member) {
      throw new NotFoundException(`Member not found: ${query.memberId}`);
    }

    return new GetMemberResult(
      member.id,
      member.email,
      member.job,
      member.nickname,
      member.notification,
      member.frequency,
      member.point,
      member.isPro,
      member.activity,
    );
  }
}
