import { NotificationFrequency } from "@/bounded-context/member/domain/member/enums";
import { Notification } from "@/bounded-context/member/domain/member/enums";

export interface SignUpMemberRequest {
  email: string;
  password: string;
  nickname: string;
  job: string;
  notification: Notification;
  frequency: NotificationFrequency;
}

export interface SignUpMeberResponse {
  memberId: string;
}

export interface SignUpMemberUseCase {
  execute(req: SignUpMemberRequest): Promise<SignUpMeberResponse>;
}
