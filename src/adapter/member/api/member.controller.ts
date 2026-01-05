import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  type ChangePasswordRequestDto,
  type RegisterMemberRequestDto,
  RequestChangeEmailDto,
  UpdateMemberRequestDto,
  VerifyChangeEmailDto,
} from "@/adapter/member/api/dto";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  ChangePasswordCommand,
  MemberRegisterCommand,
  MemberUpdateCommand,
  MemberWithdrawCommand,
  RequestChangeEmailCommand,
  VerifyChangeEmailCommand,
} from "@/application/member/command";
import { GetMemberQuery, GetMemberResult } from "@/application/member/query";
import { JwtAuthGuard } from "@/adapter/auth/security";

@Controller("members")
export class MemberController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post("register")
  async register(@Body() registerDto: RegisterMemberRequestDto) {
    const memberId: string = await this.commandBus.execute<
      MemberRegisterCommand,
      string
    >(
      new MemberRegisterCommand(
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

  @Delete(":id")
  async withdraw(@Param("id") id: string) {
    const memberId: string = await this.commandBus.execute<
      MemberWithdrawCommand,
      string
    >(new MemberWithdrawCommand(id));

    return { id: memberId };
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard)
  async update(
    @Param("id") id: string,
    @Body() updateMemberRequestDto: UpdateMemberRequestDto,
  ) {
    const memberId: string = await this.commandBus.execute<
      MemberUpdateCommand,
      string
    >(
      new MemberUpdateCommand(
        id,
        updateMemberRequestDto.job,
        updateMemberRequestDto.nickname,
        updateMemberRequestDto.notification,
        updateMemberRequestDto.frequency,
      ),
    );

    return { id: memberId };
  }

  @Patch(":id/password")
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Param("id") id: string,
    @Body() changePasswordRequestDto: ChangePasswordRequestDto,
  ) {
    const memberId: string = await this.commandBus.execute<
      ChangePasswordCommand,
      string
    >(
      new ChangePasswordCommand(
        id,
        changePasswordRequestDto.currentPassword,
        changePasswordRequestDto.newPassword,
      ),
    );

    return { id: memberId };
  }

  @Post(":id/email/request")
  @UseGuards(JwtAuthGuard)
  async requestChangeEmail(
    @Param("id") id: string,
    @Body() requestDto: RequestChangeEmailDto,
  ) {
    await this.commandBus.execute<RequestChangeEmailCommand, void>(
      new RequestChangeEmailCommand(id, requestDto.newEmail),
    );

    return { success: true, message: "인증 코드가 이메일로 발송되었습니다." };
  }

  @Post(":id/email/verify")
  @UseGuards(JwtAuthGuard)
  async verifyChangeEmail(
    @Param("id") id: string,
    @Body() verifyDto: VerifyChangeEmailDto,
  ) {
    const newEmail: string = await this.commandBus.execute<
      VerifyChangeEmailCommand,
      string
    >(new VerifyChangeEmailCommand(id, verifyDto.code));

    return { success: true, email: newEmail };
  }
}
