import { NotificationFrequency } from "@/bounded-context/member/domain/member/enums";
import { Notification } from "@/bounded-context/member/domain/member/enums";

export interface UpdateMemberRequest {
  memberId: string;
  job?: string;
  nickname?: string;
  notification?: Notification;
  frequency?: NotificationFrequency;
}
