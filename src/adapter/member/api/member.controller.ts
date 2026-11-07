import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  AddPointDto,
  ChangeEmailDto,
  type ChangePasswordDto,
  type RegisterMemberDto,
  ResetPasswordDto,
  SendEmailVerificationDto,
  UpdateMemberDto,
  UpdateScoreDto,
  VerifyEmailDto,
} from "@/adapter/member/api/dto";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  AddPointCommand,
  ChangeEmailCommand,
  ChangePasswordCommand,
  MemberRegisterCommand,
  MemberUpdateCommand,
  MemberWithdrawCommand,
  ResetPasswordCommand,
  ResetPasswordResult,
  SendEmailVerificationCommand,
  VerifyEmailCommand,
} from "@/application/member/command";
import {
  GetMemberQuery,
  GetMemberResult,
  GetMembersQuery,
  GetMembersResult,
} from "@/application/member/query";
import { CurrentUser } from "@/adapter/shared/api/decorators/current-user.decorator";
import { type User } from "@/adapter/shared/api/types/user";
import { Public } from "@/adapter/shared/api/decorators/public.decorator";
import {
  GetMemberEmailQuery,
  GetMemberEmailResult,
} from "@/application/member/query/get-member-email.query";
import { ApiPrepairGuard } from "@/adapter/shared/api/guards/api-prepair.guard";

@Controller("api/members")
export class MemberController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Public()
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

  @Public()
  @UseGuards(ApiPrepairGuard)
  @Get("all")
  async getMembers(
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ): Promise<GetMembersResult> {
    return this.queryBus.execute<GetMembersQuery, GetMembersResult>(
      new GetMembersQuery(
        limit ? Number.parseInt(limit, 10) : 20,
        offset ? Number.parseInt(offset, 10) : 0,
      ),
    );
  }

  @Public()
  @UseGuards(ApiPrepairGuard)
  @Get(":id")
  async getMember(@Param("id") id: string): Promise<GetMemberResult> {
    return this.queryBus.execute<GetMemberQuery, GetMemberResult>(
      new GetMemberQuery(id),
    );
  }

  @Public()
  @Get()
  async getMemberByEmail(
    @Query("email") email: string,
  ): Promise<GetMemberEmailResult> {
    return this.queryBus.execute<GetMemberEmailQuery, GetMemberEmailResult>(
      new GetMemberEmailQuery(email),
    );
  }

  @Public()
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

  @Public()
  @Post("email-verify")
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return await this.commandBus.execute<VerifyEmailCommand, string>(
      new VerifyEmailCommand(dto.email, dto.code),
    );
  }

  @Patch()
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

  @Public()
  @Post("password-reset")
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    const result: ResetPasswordResult = await this.commandBus.execute<
      ResetPasswordCommand,
      ResetPasswordResult
    >(
      new ResetPasswordCommand(
        resetPasswordDto.email,
        resetPasswordDto.verificationCode,
        resetPasswordDto.newPassword,
      ),
    );

    return {
      success: true,
      memberId: result.memberId,
      message: "비밀번호를 바꿨습니다. 새 비밀번호로 로그인해 주세요.",
    };
  }

  @Patch("email")
  async changeEmail(
    @CurrentUser() user: User,
    @Body() changeEmailRequestDto: ChangeEmailDto,
  ) {
    const result = await this.commandBus.execute<ChangeEmailCommand, string>(
      new ChangeEmailCommand(user.memberId, changeEmailRequestDto.newEmail),
    );

    return { newEmail: result };
  }

  @Public()
  @Patch(":id/point")
  async addPoint(@Param("id") memberId: string, @Body() dto: AddPointDto) {
    await this.commandBus.execute(new AddPointCommand(memberId, dto.point));
    return { success: true };
  }

  @Public()
  @UseGuards(ApiPrepairGuard)
  @Patch("reward")
  async updateScore(@Body() dto: UpdateScoreDto) {
    await this.commandBus.execute(new AddPointCommand(dto.memberId, dto.score));

    return {
      success: true,
    };
  }

  @Delete()
  async withdraw(@CurrentUser() user: User) {
    const memberId: string = await this.commandBus.execute<
      MemberWithdrawCommand,
      string
    >(new MemberWithdrawCommand(user.memberId));

    return { id: memberId };
  }
}
