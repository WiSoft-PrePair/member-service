import { Module } from "@nestjs/common";
import { MemberController } from "@/adapter/member/api";
import { RegisterMemberService } from "@/application/member";
import {
  MemberMapper,
  MemberRepositoryImpl,
} from "@/adapter/member/persistence";
import { MEMBER_REPOSITORY, PASSWORD_ENCODER } from "@/domain/member";
import { SecurePasswordEncoder } from "@/adapter/member/security";

@Module({
  controllers: [MemberController],
  providers: [
    RegisterMemberService,
    MemberMapper,
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
