import {
  AddPointCommand,
  AddPointCommandHandler,
  ChangePasswordCommandHandler,
  MemberRegisterCommandHandler,
  MemberUpdateCommandHandler,
  ResetPasswordCommandHandler,
  SendEmailVerificationCommandHandler,
  VerifyChangeEmailCommandHandler,
  VerifyEmailCommandHandler,
  WithdrawMemberCommandHandler,
} from "@/application/member/command";
import { GetMemberHandler } from "@/application/member/query";
import {
  MemberEmailChangedEventHandler,
  MemberLoginEventHandler,
  MemberPasswordChangedEventHandler,
  MemberPasswordResetEventHandler,
  MemberRegisterEventHandler,
  MemberUpdateEventHandler,
  MemberWithdrawEventHandler,
} from "@/application/member/event";
import { GetMemberEmailQueryHandler } from "@/application/member/query/get-member-email.query";

export const CommandHandlers = [
  MemberRegisterCommandHandler,
  WithdrawMemberCommandHandler,
  MemberUpdateCommandHandler,
  ChangePasswordCommandHandler,
  SendEmailVerificationCommandHandler,
  VerifyEmailCommandHandler,
  VerifyChangeEmailCommandHandler,
  ResetPasswordCommandHandler,
  AddPointCommandHandler,
];

export const QueryHandlers = [GetMemberHandler, GetMemberEmailQueryHandler];

export const EventHandlers = [
  MemberRegisterEventHandler,
  MemberWithdrawEventHandler,
  MemberUpdateEventHandler,
  MemberPasswordChangedEventHandler,
  MemberEmailChangedEventHandler,
  MemberPasswordResetEventHandler,
  MemberLoginEventHandler,
];
