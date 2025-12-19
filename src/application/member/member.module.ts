import { Module } from "@nestjs/common";
import { MEMBER_REPOSITORY } from "@/domain/member";
import { RegisterMemberService } from "@/application/member/register-member.service";
import { MemberRepositoryImpl } from "@/adapter/member/persistence/mikro-orm/member.repository-impl";
import { MemberController } from "@/adapter/member/api/member.controller";
import { PASSWORD_ENCODER } from "@/domain/member/password-encoder";
import { SecurePasswordEncoder } from "@/adapter/member/security/secure-password-encoder";

@Module({
  controllers: [MemberController],
  providers: [
    RegisterMemberService,
    {
      provide: MEMBER_REPOSITORY,
      useClass: MemberRepositoryImpl,
    },
    {
      provide: PASSWORD_ENCODER,
      useClass: SecurePasswordEncoder,
    },
  ],
  exports: [RegisterMemberService],
})
export class MemberModule {}
