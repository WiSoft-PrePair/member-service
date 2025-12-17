import { Body, Controller, Post } from "@nestjs/common";
import { RegisterMemberService } from "@/application/member/register-member.service";
import { RegisterMemberRequest } from "@/adapter/member/api/dto/register-member.request";
import { Member } from "@/domain/member";

@Controller("members")
export class MemberController {
  constructor(private readonly registerMemberService: RegisterMemberService) {}

  @Post("register")
  async register(@Body() request: RegisterMemberRequest) {
    const member: Member = await this.registerMemberService.register(request);

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
