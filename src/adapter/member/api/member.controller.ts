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
  ChangeEmailDto,
  type ChangePasswordDto,
  type RegisterMemberDto,
  SendEmailVerificationDto,
  UpdateMemberDto,
  VerifyEmailDto,
} from "@/adapter/member/api/dto";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  ChangeEmailCommand,
  ChangePasswordCommand,
  MemberRegisterCommand,
  MemberUpdateCommand,
  MemberWithdrawCommand,
  SendEmailVerificationCommand,
  VerifyEmailCommand,
} from "@/application/member/command";
import { GetMemberQuery, GetMemberResult } from "@/application/member/query";
import { JwtAuthGuard } from "@/adapter/auth/security";
import { CurrentUser } from "@/adapter/auth/api/decorators/current-user.decorator";
import { type User } from "@/adapter/shared/api/types/user";

@Controller("api/members")
export class MemberController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

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

  /**
   * 이메일 검증 코드 발송 (회원가입/이메일변경 공용)
   * POST /members/email/send-verification
   */
  @Post("email")
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
  @Post("email-verify")
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    const result = await this.commandBus.execute<VerifyEmailCommand, string>(
      new VerifyEmailCommand(dto.email, dto.code),
    );

    return result;
  }

  @Patch()
  @UseGuards(JwtAuthGuard)
  async update(
    @CurrentUser() user: User,
    @Body() updateMemberRequestDto: UpdateMemberDto,
  ) {
    const memberId: string = await this.commandBus.execute<
      MemberUpdateCommand,
      string
    >(
      new MemberUpdateCommand(
        user.memberId,
        updateMemberRequestDto.job,
        updateMemberRequestDto.nickname,
        updateMemberRequestDto.notification,
        updateMemberRequestDto.frequency,
      ),
    );

    return { id: memberId };
  }

  @Patch("password")
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: User,
    @Body() changePasswordRequestDto: ChangePasswordDto,
  ) {
    const memberId: string = await this.commandBus.execute<
      ChangePasswordCommand,
      string
    >(
      new ChangePasswordCommand(
        user.memberId,
        changePasswordRequestDto.currentPassword,
        changePasswordRequestDto.newPassword,
      ),
    );

    return { id: memberId };
  }

  @Patch("email")
  @UseGuards(JwtAuthGuard)
  async changeEmail(
    @CurrentUser() user: User,
    @Body() changeEmailRequestDto: ChangeEmailDto,
  ) {
    const result = await this.commandBus.execute<ChangeEmailCommand, string>(
      new ChangeEmailCommand(user.memberId, changeEmailRequestDto.newEmail),
    );

    return { newEmail: result };
  }

  @Delete()
  @UseGuards(JwtAuthGuard)
  async withdraw(@CurrentUser() user: User) {
    const memberId: string = await this.commandBus.execute<
      MemberWithdrawCommand,
      string
    >(new MemberWithdrawCommand(user.memberId));

    return { id: memberId };
  }
}
