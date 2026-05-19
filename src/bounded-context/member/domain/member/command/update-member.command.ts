import { Notification } from "@/bounded-context/member/domain/member/enums";
import type { NotificationFrequency } from "../enums/frequency.enum";
import type { Nickname } from "../value-objects/nickname.vo";

export interface UpdateMemberCommand {
  job?: string;
  nickname?: Nickname;
  notification?: Notification;
  frequency?: NotificationFrequency;
}
