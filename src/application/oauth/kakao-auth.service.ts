import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { KakaoOauthService } from "@/adapter/oauth/kakao/kakao-oauth.service";
import { JwtService } from "@/adapter/auth/security";
import { RefreshTokenService } from "@/application/auth";
import {
  FrequencyEnum,
  Member,
  MEMBER_REPOSITORY,
  type MemberRepository,
  NotificationEnum,
} from "@/domain/member";
import {
  OAUTH_REPOSITORY,
  OAuthConnection,
  type OauthRepository,
} from "@/domain/oauth";
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadRepository,
} from "@/application/member/ports";
import { EntityManager } from "@mikro-orm/postgresql";
import {
  KakaoUserInfo,
  KakaoUserProfile,
} from "@/adapter/oauth/kakao/types/kakao-oauth.types";
import { OAuthRegistrationTokenService } from "@/application/oauth/oauth-registration-token.service";
import { CommandBus } from "@nestjs/cqrs";
import {
  OAuthMemberRegisterCommand,
  OAuthMemberRegisterCommandResult,
} from "@/application/oauth/command/oauth-member-register.command";

@Injectable()
export class KakaoAuthService {
  constructor(
    private readonly kakaoOAuthService: KakaoOauthService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly registrationTokenService: OAuthRegistrationTokenService,
    private readonly commandBus: CommandBus,
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(OAUTH_REPOSITORY)
    private readonly oauthConnectionRepository: OauthRepository,
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    private readonly em: EntityManager,
  ) {}

  async handleCallback(code: string) {
    const kakaoTokens =
      await this.kakaoOAuthService.exchangeCodeForAccessToken(code);

    // eslint-disable-next-line
    const kakaoUser = await this.kakaoOAuthService.getUserInfo(
      kakaoTokens.access_token,
    );

    const { kakaoId, email, nickname } =
      this.extractKakaoUserProfile(kakaoUser);

    // Case 1: 기존 OAuth 연결이 있는 경우 → 로그인
    const existingConnection =
      await this.oauthConnectionRepository.findByProviderAndProviderId(
        "kakao",
        kakaoId,
      );

    if (existingConnection) {
      return this.loginExistingMember(existingConnection.memberId);
    }

    // Case 2: 동일 이메일로 가입된 일반 회원이 있는 경우 → OAuth 연결 후 로그인
    const existingMember = await this.memberRepository.findByEmail(email);

    if (existingMember) {
      await this.connectOAuthToExistingMember(existingMember, kakaoId, email);
      return this.loginExistingMember(existingMember.id);
    }

    // Case 3: 신규 회원 → 등록 토큰 발급 (회원가입 미완료 상태)
    const registrationToken =
      this.registrationTokenService.generateRegistrationToken({
        email,
        nickname,
        provider: "kakao",
        providerId: kakaoId,
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
    const oauthData =
      this.registrationTokenService.verifyRegistrationToken(registrationToken);

    // 2. 중복 가입 체크 (등록 토큰 발급 후 다른 경로로 가입한 경우)
    const existingMember = await this.memberRepository.findByEmail(
      oauthData.email,
    );
    if (existingMember) {
      throw new ConflictException("이미 가입된 이메일입니다.");
    }

    const existingConnection =
      await this.oauthConnectionRepository.findByProviderAndProviderId(
        oauthData.provider,
        oauthData.providerId,
      );
    if (existingConnection) {
      throw new ConflictException("이미 연결된 카카오 계정입니다.");
    }

    // 3. CommandBus를 통해 회원가입 완료 (CQRS 플로우)
    const result = await this.commandBus.execute<
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
      ),
    );

    // 4. Access Token 발급
    const accessToken = this.jwtService.generateAccessToken(
      result.memberId,
      result.member.email.value,
    );

    const refreshToken = await this.refreshTokenService.create(result.memberId);

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
    const member = await this.memberRepository.findById(memberId);

    if (!member) {
      throw new BadRequestException(
        "회원 정보를 찾을 수 없습니다. 다시 로그인해주세요.",
      );
    }

    await this.updateActivityLog(memberId);

    const accessToken = this.jwtService.generateAccessToken(
      member.id,
      member.email.value,
    );

    const refreshToken = await this.refreshTokenService.create(member.id);

    await this.em.flush();

    return {
      isNewMember: false,
      accessToken: accessToken.accessToken,
      refreshToken,
      accessTokenExpiresIn: accessToken.expiresIn,
      memberId: member.id,
    };
  }

  /**
   * 기존 회원에 OAuth 연결
   */
  // eslint-disable-next-line
  private async connectOAuthToExistingMember(
    member: Member,
    providerId: string,
    email: string,
  ) {
    const connection = OAuthConnection.connect({
      memberId: member.id,
      provider: "kakao",
      providerId,
      email,
    });

    this.oauthConnectionRepository.save(connection);
  }

  /**
   * 카카오 사용자 정보 추출
   */
  private extractKakaoUserProfile(kakaoUser: KakaoUserInfo): KakaoUserProfile {
    const kakaoId = String(kakaoUser.id);
    const email = kakaoUser.kakao_account?.email;
    const nickname = kakaoUser.kakao_account?.profile?.nickname;

    if (!email) {
      throw new BadRequestException(
        '이메일 정보가 필요합니다. 카카오 동의항목에서 "카카오계정(이메일)"을 필수 동의로 설정해주세요.',
      );
    }

    if (!nickname) {
      throw new BadRequestException(
        '닉네임 정보가 필요합니다. 카카오 동의항목에서 "닉네임"을 필수 동의로 설정해주세요.',
      );
    }

    return { kakaoId, email, nickname };
  }

  /**
   * 활동 기록 업데이트
   */
  private async updateActivityLog(memberId: string): Promise<void> {
    const readEntity = await this.memberReadRepository.findById(memberId);

    if (readEntity) {
      const today = new Date().toISOString().slice(0, 10);
      readEntity.activity = readEntity.activity ?? [];

      if (!readEntity.activity.includes(today)) {
        readEntity.activity.push(today);
      }
    }
  }
}
