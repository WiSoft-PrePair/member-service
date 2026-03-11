import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Post,
} from "@nestjs/common";
import { MemberReadEntity } from "@/adapter/member/persistence/read";
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadRepository,
} from "@/application/member/ports";
import { JwtService } from "@/adapter/auth/security";
import { AuthService, RefreshTokenService } from "@/application/auth";
import {
  LoginRequestDto,
  LogoutRequestDto,
  RefreshTokenRequestDto,
} from "@/adapter/auth/api/dto";
import { CurrentUser } from "@/adapter/shared/api/decorators/current-user.decorator";
import { type User } from "@/adapter/shared/api/types/user";
import { Public } from "@/adapter/shared/api/decorators/public.decorator";
import { JwtToken } from "@/application/oauth/ports";

@Controller("api/auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly jwtService: JwtService,
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
  ) {}

  @Public()
  @Post("login")
  async login(@Body() loginRequestDto: LoginRequestDto) {
    const loginResult = await this.authService.login(loginRequestDto);

    const accessToken: JwtToken = this.jwtService.generateAccessToken(
      loginResult.memberId,
      loginResult.email,
      loginResult.job,
    );

    const refreshToken: string = await this.refreshTokenService.create(
      loginResult.memberId,
    );

    const {
      memberId,
      email,
      job,
      nickname,
      notification,
      frequency,
      point,
      isPro,
      activity,
    } = loginResult;

    return {
      accessToken: accessToken.accessToken,
      refreshToken,
      accessTokenExpiresIn: accessToken.expiresIn,
      member_info: {
        memberId,
        email,
        job,
        nickname,
        notification,
        frequency,
        point,
        isPro,
        activity,
      },
    };
  }

  @Public()
  @Post("refresh")
  async refresh(@Body() refreshToken: RefreshTokenRequestDto) {
    const memberId: string = await this.refreshTokenService.verify(
      refreshToken.refreshToken,
    );

    const member: MemberReadEntity | null =
      await this.memberReadRepository.findById(memberId);

    if (!member) {
      throw new NotFoundException("회원 정보를 찾을 수 없습니다.");
    }

    const newRefreshToken: string = await this.refreshTokenService.rotate(
      refreshToken.refreshToken,
      memberId,
    );

    const accessToken = this.jwtService.generateAccessToken(
      member.id,
      member.email,
      member.job,
    );

    return {
      accessToken: accessToken.accessToken,
      refreshToken: newRefreshToken,
      accessTokenExpiresIn: accessToken.expiresIn,
    };
  }

  @Public()
  @Post("logout")
  async logout(
    @Body() logoutRequestDto: LogoutRequestDto,
  ): Promise<{ success: boolean }> {
    await this.refreshTokenService.revoke(logoutRequestDto.refreshToken);
    return { success: true };
  }

  @Get("me")
  getUser(@CurrentUser() user: User) {
    return {
      memberId: user.memberId,
      email: user.email,
    };
  }
}
