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
  type ChangePasswordDto,
  type RegisterMemberDto,
  SendEmailVerificationDto,
  UpdateMemberDto,
  VerifyEmailDto,
} from "@/adapter/member/api/dto";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  ChangePasswordCommand,
  MemberRegisterCommand,
  MemberUpdateCommand,
  MemberWithdrawCommand,
  SendEmailVerificationCommand,
  VerifyEmailCommand,
} from "@/application/member/command";
import { GetMemberQuery, GetMemberResult } from "@/application/member/query";
import { JwtAuthGuard } from "@/adapter/auth/security";

@Controller("members")
export class MemberController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  /**
   * 이메일 검증 코드 발송 (회원가입/이메일변경 공용)
   * POST /members/email/send-verification
   */
  @Post("email/")
  async sendEmailVerification(@Body() dto: SendEmailVerificationDto) {
    await this.commandBus.execute(
      new SendEmailVerificationCommand(dto.email, dto.purpose),
    );

    return {
      success: true,
      message: "인증 코드가 이메일로 발송되었습니다.",
    };
  }

  /**
   * 이메일 검증 코드 확인
   * POST /members/email/verify
   */
  @Post("email/verify")
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    const token = await this.commandBus.execute<VerifyEmailCommand, string>(
      new VerifyEmailCommand(dto.email, dto.code),
    );

    return {
      success: true,
      verificationToken: token,
      message: "이메일 검증이 완료되었습니다.",
    };
  }

  @Post("register")
  async register(@Body() registerDto: RegisterMemberDto) {
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
        registerDto.verificationToken,
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
    @Body() updateMemberRequestDto: UpdateMemberDto,
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
    @Body() changePasswordRequestDto: ChangePasswordDto,
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
}
