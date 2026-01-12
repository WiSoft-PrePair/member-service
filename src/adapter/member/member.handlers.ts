import {
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
];

export const QueryHandlers = [GetMemberHandler, GetMemberEmailQueryHandler];

export const EventHandlers = [
  MemberRegisterEventHandler,
  MemberWithdrawEventHandler,
  MemberUpdateEventHandler,
  MemberPasswordChangedEventHandler,
  MemberEmailChangedEventHandler,
  MemberPasswordResetEventHandler,
];
