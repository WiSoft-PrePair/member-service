import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { RegisterMemberRequestDto } from "@/adapter/member/api/dto";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { RegisterMemberCommand } from "@/application/member/command";
import {
  GetMemberHandler,
  GetMemberQuery,
  GetMemberResult,
} from "@/application/member/query";

@Controller("members")
export class MemberController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

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

  @Get(":id")
  async getMember(@Param("id") id: string): Promise<GetMemberResult> {
    return this.queryBus.execute<GetMemberQuery, GetMemberResult>(
      new GetMemberQuery(id),
    );
  }
}
