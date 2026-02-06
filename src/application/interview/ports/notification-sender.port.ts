// 알림 타입
export type NotificationChannel = "email" | "kakao";

// 면접 질문 알림 콘텐츠
export interface InterviewQuestionNotification {
  question: string;
  questionTag: string;
  recipientName: string;
}

// 알림 발송 인터페이스
export interface NotificationSender {
  readonly channel: NotificationChannel;

  send(
    recipient: { email?: string; kakaoAccessToken?: string },
    content: InterviewQuestionNotification,
  ): Promise<void>;

  supports(channel: NotificationChannel): boolean;
}

export const NOTIFICATION_SENDER: symbol = Symbol("NOTIFICATION_SENDER");
