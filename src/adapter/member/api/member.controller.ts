import { Body, Controller, Post } from "@nestjs/common";
import { Member, type RegisterMemberRequest } from "@/domain/member";
import { RegisterMemberService } from "@/application/member/register-member.service";

@Controller("members")
export class MemberController {
  constructor(private readonly registerMemberService: RegisterMemberService) {}

  @Post("register")
  async register(@Body() registerRequest: RegisterMemberRequest) {
    const member: Member =
      await this.registerMemberService.register(registerRequest);

    return {
      id: member.id,
      email: member.email.value,
      nickname: member.nickname,
      job: member.job,
      notification: member.notification,
      frequency: member.frequency,
      point: member.point,
      isPro: member.isPro,
    };
  }
}
