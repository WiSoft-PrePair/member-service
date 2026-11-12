import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  OauthCallbackDto,
  OauthCompleteRegisterDto,
} from "@/adapter/oauth/api/dto";
import { CurrentUser } from "@/adapter/shared/api/decorators/current-user.decorator";
import { Public } from "@/adapter/shared/api/decorators/public.decorator";
import type { User } from "@/adapter/shared/api/types/user";
import { KakaOauthService } from "@/application/oauth/kaka-oauth.service";
import type { Env } from "@/config/env.config";

@Controller("api/auth/kakao")
export class KakaoOauthController {
  private readonly defaultRedirectUri: string;
  private readonly allowedRedirectUris: ReadonlySet<string>;

  constructor(
    private readonly kakaoAuthService: KakaOauthService,
    private readonly configService: ConfigService<Env, true>,
  ) {
    this.defaultRedirectUri =
      this.configService.getOrThrow("KAKAO_REDIRECT_URI");
    const allowedRaw: string =
      this.configService.get("KAKAO_ALLOWED_REDIRECT_URIS", { infer: true }) ??
      "";
    const parsed: string[] = allowedRaw
      .split(",")
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);
    this.allowedRedirectUris = new Set<string>([
      this.defaultRedirectUri,
      ...parsed,
    ]);
  }

  // 화이트리스트 미일치 시 default로 강등시켜 OAuth open-redirect / authorization code interception을 차단한다.
  private resolveRedirectUri(candidate?: string): string {
    if (candidate && this.allowedRedirectUris.has(candidate)) {
      return candidate;
    }
    return this.defaultRedirectUri;
  }

  @Public()
  @Get("url")
  getAuthorizationUrl(
    @Query("state") state?: string,
    @Query("prompt") prompt?: string,
    @Query("redirectUri") redirectUriParam?: string,
  ) {
    const clientId: string = this.configService.getOrThrow("KAKAO_CLIENT_ID");
    const redirectUri: string = this.resolveRedirectUri(redirectUriParam);

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

    return { url: url.toString(), redirectUri };
  }

  @Public()
  @Post("callback")
  async callback(@Body() dto: OauthCallbackDto) {
    const redirectUri: string = this.resolveRedirectUri(dto.redirectUri);
    return this.kakaoAuthService.handleCallback(dto.code, redirectUri);
  }

  @Public()
  @Post("register")
  async register(@Body() dto: OauthCompleteRegisterDto) {
    return this.kakaoAuthService.completeRegistration(
      dto.registrationToken,
      dto.job,
    );
  }

  @Post("link")
  async link(@CurrentUser() user: User, @Body() dto: OauthCallbackDto) {
    const redirectUri: string = this.resolveRedirectUri(dto.redirectUri);
    return this.kakaoAuthService.linkToExistingMember(
      user.memberId,
      dto.code,
      redirectUri,
    );
  }
}
