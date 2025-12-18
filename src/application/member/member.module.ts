import { Module } from "@nestjs/common";
import { MEMBER_REPOSITORY } from "@/domain/member";
import { RegisterMemberService } from "@/application/member/register-member.service";
import { MemberRepositoryImpl } from "@/adapter/member/persistence/member.repository-impl";
import { MemberController } from "@/adapter/member/api/member.controller";

@Module({
  controllers: [MemberController],
  providers: [
    RegisterMemberService,
    {
      provide: MEMBER_REPOSITORY,
      useClass: MemberRepositoryImpl,
    },
  ],
  exports: [RegisterMemberService],
})
export class MemberModule {}
