import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { JwtService } from "@/adapter/auth/security";
import { RefreshTokenService } from "@/application/auth";
import {
  FrequencyEnum,
  Member,
  MEMBER_REPOSITORY,
  MemberLoginEvent,
  type MemberRepository,
  NotificationEnum,
} from "@/domain/member";
import {
  OAUTH_REPOSITORY,
  OAuthConnection,
  type OauthRepository,
} from "@/domain/oauth";
import { EntityManager } from "@mikro-orm/postgresql";
import {
  OAuthRegistrationTokenService,
  RegistrationTokenData,
} from "@/application/oauth/oauth-registration-token.service";
import { CommandBus, EventBus } from "@nestjs/cqrs";
import {
  OAuthMemberRegisterCommand,
  OAuthMemberRegisterCommandResult,
} from "@/application/oauth/command/oauth-member-register.command";
import {
  KAKAO_OAUTH_PROVIDER,
  type OAuthProvider,
  OAuthTokenResponse,
  OAuthUserInfo,
} from "@/application/oauth/ports/oauth-provider.port";
import { JwtToken } from "@/application/oauth/ports";
import { MemberUpdateCommand } from "@/application/member/command/member-update.command";

@Injectable()
export class KakaOauthService {
  constructor(
    @Inject(KAKAO_OAUTH_PROVIDER)
    private readonly oauthProvider: OAuthProvider,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly registrationTokenService: OAuthRegistrationTokenService,
    private readonly commandBus: CommandBus,
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(OAUTH_REPOSITORY)
    private readonly oauthConnectionRepository: OauthRepository,
    private readonly em: EntityManager,
    private readonly eventBus: EventBus,
  ) {}

  async handleCallback(code: string) {
    const tokens: OAuthTokenResponse =
      await this.oauthProvider.exchangeCodeForAccessToken(code);

    const userInfo: OAuthUserInfo = await this.oauthProvider.getUserInfo(
      tokens.accessToken,
    );

    const { providerId, email, nickname } = userInfo;

    // Case 1: 기존 OAuth 연결이 있는 경우 → 로그인
    const existingConnection: OAuthConnection | null =
      await this.oauthConnectionRepository.findByProviderAndProviderId(
        "kakao",
        providerId,
      );

    if (existingConnection) {
      await this.oauthConnectionRepository.updateTokens(existingConnection.id, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      });

      return this.loginExistingMember(existingConnection.memberId);
    }

    // Case 2: 동일 이메일로 가입된 일반 회원이 있는 경우 → OAuth 연결 후 로그인
    const existingMember: Member | null =
      await this.memberRepository.findByEmail(email);

    if (existingMember) {
      await this.connectOAuthToExistingMember(
        existingMember,
        providerId,
        email,
        tokens,
      );

      return this.loginExistingMember(existingMember.id);
    }

    // Case 3: 신규 회원 → 등록 토큰 발급 (회원가입 미완료 상태)
    const registrationToken: string =
      this.registrationTokenService.generateRegistrationToken({
        email,
        nickname,
        provider: "kakao",
        providerId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresIn: tokens.expiresIn,
      });

    return {
      isNewMember: true,
      registrationToken,
      prefilledData: {
        email,
        nickname,
      },
    };
  }

  /**
   * [2단계] 회원가입 완료
   * - 등록 토큰 검증 후 실제 회원 생성
   */
  async completeRegistration(
    registrationToken: string,
    job: string,
    notification: NotificationEnum,
    frequency: FrequencyEnum,
  ) {
    // 1. 등록 토큰 검증 및 OAuth 정보 추출
    const oauthData: RegistrationTokenData =
      this.registrationTokenService.verifyRegistrationToken(registrationToken);

    // 2. 중복 가입 체크 (등록 토큰 발급 후 다른 경로로 가입한 경우)
    const existingMember: Member | null =
      await this.memberRepository.findByEmail(oauthData.email);

    if (existingMember) {
      throw new ConflictException("이미 가입된 이메일입니다.");
    }

    const existingConnection: OAuthConnection | null =
      await this.oauthConnectionRepository.findByProviderAndProviderId(
        oauthData.provider,
        oauthData.providerId,
      );

    if (existingConnection) {
      throw new ConflictException("이미 연결된 카카오 계정입니다.");
    }

    // 3. CommandBus를 통해 회원가입 완료 (CQRS 플로우)
    const result: OAuthMemberRegisterCommandResult =
      await this.commandBus.execute<
        OAuthMemberRegisterCommand,
        OAuthMemberRegisterCommandResult
      >(
        new OAuthMemberRegisterCommand(
          oauthData.email,
          oauthData.nickname,
          oauthData.provider,
          oauthData.providerId,
          job,
          notification,
          frequency,
          oauthData.accessToken,
          oauthData.refreshToken,
          oauthData.tokenExpiresIn,
        ),
      );

    // 4. Access Token 발급
    const accessToken: JwtToken = this.jwtService.generateAccessToken(
      result.memberId,
      result.member.email.value,
      result.member.job,
    );

    const refreshToken: string = await this.refreshTokenService.create(
      result.memberId,
    );

    await this.em.flush();

    return {
      accessToken: accessToken.accessToken,
      refreshToken,
      accessTokenExpiresIn: accessToken.expiresIn,
      memberId: result.memberId,
      isNewMember: true,
      nickname: result.member.nickname,
    };
  }

  /**
   * 기존 회원 로그인 처리
   */
  private async loginExistingMember(memberId: string) {
    const member: Member | null =
      await this.memberRepository.findById(memberId);

    if (!member) {
      throw new BadRequestException(
        "회원 정보를 찾을 수 없습니다. 다시 로그인해주세요.",
      );
    }

    this.eventBus.publish(new MemberLoginEvent(memberId));

    const accessToken: JwtToken = this.jwtService.generateAccessToken(
      member.id,
      member.email.value,
      member.job,
    );

    const refreshToken: string = await this.refreshTokenService.create(
      member.id,
    );

    await this.em.flush();

    return {
      isNewMember: false,
      accessToken: accessToken.accessToken,
      refreshToken,
      accessTokenExpiresIn: accessToken.expiresIn,
      memberId: member.id,
      nickname: member.nickname,
    };
  }

  /**
   * [명시적 연동] 로그인된 회원이 카카오 계정을 연동
   */
  async linkToExistingMember(memberId: string, code: string) {
    const tokens: OAuthTokenResponse =
      await this.oauthProvider.exchangeCodeForAccessToken(code);

    const userInfo: OAuthUserInfo = await this.oauthProvider.getUserInfo(
      tokens.accessToken,
    );

    // 해당 카카오 계정이 이미 다른 회원에게 연결되어 있는지 확인
    const existingConnection: OAuthConnection | null =
      await this.oauthConnectionRepository.findByProviderAndProviderId(
        "kakao",
        userInfo.providerId,
      );

    if (existingConnection) {
      if (existingConnection.memberId === memberId) {
        throw new ConflictException("이미 연결된 카카오 계정입니다.");
      }
      throw new ConflictException(
        "해당 카카오 계정은 다른 회원에게 연결되어 있습니다.",
      );
    }

    // 이 회원에 이미 카카오 연동이 있는지 확인
    const memberConnection: OAuthConnection | null =
      await this.oauthConnectionRepository.findByMemberIdAndProvider(
        memberId,
        "kakao",
      );

    if (memberConnection) {
      throw new ConflictException("이미 카카오 계정이 연동되어 있습니다.");
    }

    const connection: OAuthConnection = OAuthConnection.connect({
      memberId,
      provider: "kakao",
      providerId: userInfo.providerId,
      email: userInfo.email,
    });

    this.oauthConnectionRepository.save(connection);

    await this.oauthConnectionRepository.updateTokens(connection.id, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
    });

    await this.em.flush();

    // notification을 BOTH로 변경 (이메일 + 카카오 알림)
    await this.commandBus.execute(
      new MemberUpdateCommand(
        memberId,
        undefined,
        undefined,
        NotificationEnum.BOTH,
      ),
    );

    // 기존 세션 유지를 위해 새 accessToken 발급
    const member: Member | null =
      await this.memberRepository.findById(memberId);

    if (!member) {
      throw new BadRequestException("회원 정보를 찾을 수 없습니다.");
    }

    const accessToken: JwtToken = this.jwtService.generateAccessToken(
      member.id,
      member.email.value,
      member.job,
    );

    return {
      linked: true,
      provider: "kakao",
      accessToken: accessToken.accessToken,
      accessTokenExpiresIn: accessToken.expiresIn,
    };
  }

  /**
   * 기존 회원에 OAuth 연결 (카카오 로그인 시 동일 이메일 자동 연동)
   */
  private async connectOAuthToExistingMember(
    member: Member,
    providerId: string,
    email: string,
    tokens: OAuthTokenResponse,
  ) {
    const connection: OAuthConnection = OAuthConnection.connect({
      memberId: member.id,
      provider: "kakao",
      providerId,
      email,
    });

    this.oauthConnectionRepository.save(connection);

    await this.oauthConnectionRepository.updateTokens(connection.id, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
    });
  }
}
