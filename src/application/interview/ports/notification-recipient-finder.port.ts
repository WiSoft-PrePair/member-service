import { FrequencyEnum, NotificationEnum } from "@/domain/member";

/**
 * 알림 수신자 정보
 * - 여러 Bounded Context를 조합
 */
export interface NotificationRecipient {
  memberId: string;
  email: string;
  nickname: string;
  job: string;
  notification: NotificationEnum;
  frequency: FrequencyEnum;
  kakaoAccessToken?: string;
  kakaoRefreshToken?: string;
  kakaoConnectionId?: string;
}

// 알림 수싲ㄴ자 조회 인터페이스
export interface NotificationRecipientFinder {
  findEligibleRecipients(
    frequency: FrequencyEnum,
  ): Promise<NotificationRecipient[]>;
}

export const NOTIFICATION_RECIPIENT_FINDER = Symbol(
  "NOTIFICATION_RECIPIENT_FINDER",
);
