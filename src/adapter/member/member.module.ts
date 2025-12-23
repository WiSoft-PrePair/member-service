import { Module } from "@nestjs/common";
import { MemberController } from "@/adapter/member/api/member.controller";
import { RegisterMemberService } from "@/application/member/register-member.service";
import { SecurePasswordEncoder } from "@/adapter/member/security/secure-password-encoder";
import { MemberRepositoryImpl } from "@/adapter/member/persistence/mikro-orm/member.respository-impl";
import { MEMBER_REPOSITORY } from "@/domain/member";
import { PASSWORD_ENCODER } from "@/domain/member/password-encoder";

@Module({
  controllers: [MemberController],
  providers: [
    RegisterMemberService,
    {
      provide: PASSWORD_ENCODER,
      useClass: SecurePasswordEncoder,
    },
    {
      provide: MEMBER_REPOSITORY,
      useClass: MemberRepositoryImpl,
    },
  ],
  exports: [RegisterMemberService],
})
export class MemberModule {}
