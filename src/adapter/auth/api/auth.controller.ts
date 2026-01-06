import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  MEMBER_READ_REPOSITORY,
  MemberReadEntity,
  type MemberReadRepository,
} from "@/adapter/member/persistence/read";
import {
  JwtAuthGuard,
  JwtService,
  TokenResponse,
} from "@/adapter/auth/security";
import { AuthService, RefreshTokenService } from "@/application/auth";
import {
  LoginRequestDto,
  LogoutRequestDto,
  RefreshTokenRequestDto,
} from "@/adapter/auth/api/dto";
import { CurrentUser } from "@/adapter/auth/api/decorators/current-user.decorator";
import { type User } from "@/adapter/shared/api/types/user";

@Controller("api/auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly jwtService: JwtService,
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
  ) {}

  @Post("login")
  async login(@Body() loginRequestDto: LoginRequestDto) {
    const loginResult: { memberId: string; email: string } =
      await this.authService.login(loginRequestDto);

    const accessToken: TokenResponse = this.jwtService.generateAccessToken(
      loginResult.memberId,
      loginResult.email,
    );

    const refreshToken: string = await this.refreshTokenService.create(
      loginResult.memberId,
    );

    return {
      accessToken: accessToken.accessToken,
      refreshToken: refreshToken,
      accessTokenExpiresIn: accessToken.expiresIn,
      loginResult: loginResult.memberId,
    };
  }

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
    );

    return {
      accessToken: accessToken.accessToken,
      refreshToken: newRefreshToken,
      accessTokenExpiresIn: accessToken.expiresIn,
    };
  }

  @Post("logout")
  async logout(
    @Body() logoutRequestDto: LogoutRequestDto,
  ): Promise<{ success: boolean }> {
    await this.refreshTokenService.revoke(logoutRequestDto.refreshToken);
    return { success: true };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  getUser(@CurrentUser() user: User) {
    return {
      memberId: user.memberId,
      email: user.email,
    };
  }
}
