import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { MemberController } from "@/adapter/member/api";
import {
  MemberMapper,
  MemberRepositoryImpl,
} from "@/adapter/member/persistence";
import {
  MEMBER_READ_REPOSITORY,
  MemberReadRepositoryImpl,
} from "@/adapter/member/persistence/read";
import { SecurePasswordEncoder } from "@/adapter/member/security";
import { EventStoreModule } from "@/adapter/shared/event-store/event-store.module";
import { MEMBER_REPOSITORY, PASSWORD_ENCODER } from "@/domain/member";
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
  MemberWithdrawEventHandler,
} from "@/application/member/event";
import { MemberUpdateEventHandler } from "@/application/member/event/member-update-event-handler.service";
import { EmailVerificationService } from "@/application/member";
import { EMAIL_SERVICE } from "@/application/member/service/email.service";
import { NodemailerService } from "@/adapter/member/email/nodemailer.service";

const CommandHandlers = [
  MemberRegisterCommandHandler,
  WithdrawMemberCommandHandler,
  MemberUpdateCommandHandler,
  ChangePasswordCommandHandler,
  SendEmailVerificationCommandHandler,
  VerifyEmailCommandHandler,
  VerifyChangeEmailCommandHandler,
];

const QueryHandlers = [GetMemberHandler];

const EventHandlers = [
  MemberRegisterEventHandler,
  MemberWithdrawEventHandler,
  MemberUpdateEventHandler,
  MemberPasswordChangedEventHandler,
  MemberEmailChangedEventHandler,
];

@Module({
  imports: [EventStoreModule, CqrsModule],
  controllers: [MemberController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    ...EventHandlers,
    MemberMapper,
    {
      provide: MEMBER_REPOSITORY,
      useClass: MemberRepositoryImpl,
    },
    {
      provide: MEMBER_READ_REPOSITORY,
      useClass: MemberReadRepositoryImpl,
    },
    {
      provide: PASSWORD_ENCODER,
      useClass: SecurePasswordEncoder,
    },
    EmailVerificationService,
    {
      provide: EMAIL_SERVICE,
      useClass: NodemailerService,
    },
  ],
  exports: [MEMBER_REPOSITORY, MEMBER_READ_REPOSITORY, PASSWORD_ENCODER],
})
export class MemberModule {}
