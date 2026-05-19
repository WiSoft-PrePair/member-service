import {
  Notification,
  NotificationFrequency,
} from "@/bounded-context/member/domain/member/enums";
import {
  Email,
  Nickname,
  Password,
} from "@/bounded-context/member/domain/member/value-objects";

export interface RegisterMemberCommand {
  email: Email;
  password: Password;
  nickname: Nickname;
  job: string;
  notification: Notification;
  frequency: NotificationFrequency;
}
