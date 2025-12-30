import { Body, Controller, Post } from "@nestjs/common";
import { RegisterMemberRequestDto } from "@/adapter/member/api/dto";
import { CommandBus } from "@nestjs/cqrs";
import { RegisterMemberCommand } from "@/application/member/command";

@Controller("members")
export class MemberController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post("register")
  async register(@Body() registerDto: RegisterMemberRequestDto) {
    const memberId: string = await this.commandBus.execute<
      RegisterMemberCommand,
      string
    >(
      new RegisterMemberCommand(
        registerDto.email,
        registerDto.password,
        registerDto.job,
        registerDto.nickname,
        registerDto.notification,
        registerDto.frequency,
      ),
    );

    return { id: memberId };
  }
}
