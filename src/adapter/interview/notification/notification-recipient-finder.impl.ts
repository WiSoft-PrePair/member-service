import { Injectable } from "@nestjs/common";
import type {
  NotificationRecipient,
  NotificationRecipientFinder,
} from "@/application/interview/ports";
import { FrequencyEnum } from "@/domain/member";
import { EntityManager } from "@mikro-orm/core";
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import { OAuthConnectionEntity } from "@/adapter/oauth/persistence/entity/oauth.entity";

@Injectable()
export class NotificationRecipientFinderImpl
  implements NotificationRecipientFinder
{
  constructor(private readonly em: EntityManager) {}

  async findEligibleRecipients(
    frequency: FrequencyEnum,
  ): Promise<NotificationRecipient[]> {
    const members: MemberReadEntity[] = await this.em.find(MemberReadEntity, {
      frequency,
    });

    if (members.length === 0) {
      return [];
    }

    const memberIds: string[] = members.map((m) => m.id);
    const kakaoConnections: OAuthConnectionEntity[] = await this.em.find(
      OAuthConnectionEntity,
      {
        memberId: { $in: memberIds },
        provider: "kakao",
      },
    );

    const kakaoConnectionMap = new Map(
      kakaoConnections.map((c) => [c.memberId, c]),
    );

    return members.map((member) => {
      const kakaoConnection: OAuthConnectionEntity | undefined =
        kakaoConnectionMap.get(member.id);

      return {
        memberId: member.id,
        email: member.email,
        nickname: member.nickname,
        job: member.job,
        notification: member.notification,
        frequency: member.frequency,
        kakaoAccessToken: kakaoConnection?.accessToken,
        kakaoRefreshToken: kakaoConnection?.refreshToken,
        kakaoConnectionId: kakaoConnection?.id,
      };
    });
  }
}
