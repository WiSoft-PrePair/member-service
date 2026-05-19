import {
  Notification,
  NotificationFrequency,
} from "@/bounded-context/member/domain/member/enums";

export interface MemberSnapshot {
  id: string;
  email: string;
  hashedPassword: string;
  nickname: string;
  job: string;
  notification: Notification;
  frequency: NotificationFrequency;
  point: number;
  isPro: boolean;
  isWithdrawn: boolean;
}
