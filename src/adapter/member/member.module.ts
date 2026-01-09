import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { MemberController } from "@/adapter/member/api";
import {
  MemberMapper,
  MemberRepositoryImpl,
} from "@/adapter/member/persistence";
import { MemberReadRepositoryImpl } from "@/adapter/member/persistence/read";
import { MEMBER_READ_REPOSITORY } from "@/application/member/ports";
import { SecurePasswordEncoder } from "@/adapter/member/security";
import { EventStoreModule } from "@/adapter/shared/event-store/event-store.module";
import { MEMBER_REPOSITORY, PASSWORD_ENCODER } from "@/domain/member";
import { EmailVerificationService } from "@/application/member";
import { EMAIL_SERVICE } from "@/application/member/service/email.service";
import { NodemailerService } from "@/adapter/member/email/nodemailer.service";
import {
  CommandHandlers,
  EventHandlers,
  QueryHandlers,
} from "./member.handlers";

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
