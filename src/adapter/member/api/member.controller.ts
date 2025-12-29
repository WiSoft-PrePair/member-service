import { Body, Controller, Post } from "@nestjs/common";
import { Member } from "@/domain/member";
import { RegisterMemberService } from "@/application/member";
import { RegisterMemberRequestDto } from "@/adapter/member/api/dto";

@Controller("members")
export class MemberController {
  constructor(private readonly registerMemberService: RegisterMemberService) {}

  @Post("register")
  async register(@Body() registerDto: RegisterMemberRequestDto) {
    const member: Member =
      await this.registerMemberService.register(registerDto);

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
