import {
  ChangePasswordCommandHandler,
  MemberRegisterCommandHandler,
  MemberUpdateCommandHandler,
  SendEmailVerificationCommandHandler,
  VerifyChangeEmailCommandHandler,
  VerifyEmailCommandHandler,
  WithdrawMemberCommandHandler,
} from "@/application/member/command";
import { GetMemberHandler } from "@/application/member/query";
import {
  MemberEmailChangedEventHandler,
  MemberPasswordChangedEventHandler,
  MemberRegisterEventHandler,
  MemberUpdateEventHandler,
  MemberWithdrawEventHandler,
} from "@/application/member/event";

export const CommandHandlers = [
  MemberRegisterCommandHandler,
  WithdrawMemberCommandHandler,
  MemberUpdateCommandHandler,
  ChangePasswordCommandHandler,
  SendEmailVerificationCommandHandler,
  VerifyEmailCommandHandler,
  VerifyChangeEmailCommandHandler,
];

export const QueryHandlers = [GetMemberHandler];

export const EventHandlers = [
  MemberRegisterEventHandler,
  MemberWithdrawEventHandler,
  MemberUpdateEventHandler,
  MemberPasswordChangedEventHandler,
  MemberEmailChangedEventHandler,
];
