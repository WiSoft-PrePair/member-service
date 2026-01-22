import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Public } from "@/adapter/shared/api/decorators/public.decorator";
import {
  OauthCallbackDto,
  OauthCompleteRegisterDto,
} from "@/adapter/oauth/api/dto";
import { KakaOauthService } from "@/application/oauth/kaka-oauth.service";

@Controller("api/auth/kakao")
export class KakaoOauthController {
  constructor(
    private readonly kakaoAuthService: KakaOauthService,
    private readonly configService: ConfigService,
  ) {}

  // 카카오 인가 URL 반환
  @Public()
  @Get("url")
  getAuthorizationUrl(
    @Query("state") state?: string,
    @Query("prompt") prompt?: string,
  ) {
    const clientId: string = this.configService.getOrThrow("KAKAO_CLIENT_ID");
    const redirectUri: string =
      this.configService.getOrThrow("KAKAO_REDIRECT_URI");

    const url = new URL("https://kauth.kakao.com/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");

    if (state) {
      url.searchParams.set("state", state);
    }

    if (prompt) {
      url.searchParams.set("prompt", prompt);
    }

    return { url: url.toString() };
  }

  // 카카오 로그인
  @Public()
  @Post("callback")
  async callback(@Body() dto: OauthCallbackDto) {
    return this.kakaoAuthService.handleCallback(dto.code);
  }

  @Public()
  @Post("register")
  async register(@Body() dto: OauthCompleteRegisterDto) {
    return this.kakaoAuthService.completeRegistration(
      dto.registrationToken,
      dto.job,
      dto.notification,
      dto.frequency,
    );
  }
}
