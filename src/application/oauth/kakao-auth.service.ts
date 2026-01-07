import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { KakaoOauthService } from "@/adapter/oauth/kakao/kakao-oauth.service";
import { JwtService } from "@/adapter/auth/security";
import { RefreshTokenService } from "@/application/auth";
import {
  FrequencyEnum,
  Member,
  MEMBER_REPOSITORY,
  type MemberRepository,
  NotificationEnum,
  PASSWORD_ENCODER,
  type PasswordEncoder,
} from "@/domain/member";
import {
  OAUTH_REPOSITORY,
  OAuthConnection,
  type OauthRepository,
} from "@/domain/oauth";
import {
  MEMBER_READ_REPOSITORY,
  type MemberReadRepository,
} from "@/adapter/member/persistence/read";
import { EntityManager } from "@mikro-orm/postgresql";
import {
  KakaoUserInfo,
  KakaoUserProfile,
} from "@/adapter/oauth/kakao/types/kakao-oauth.types";

@Injectable()
export class KakaoAuthService {
  constructor(
    private readonly kakaoOAuthService: KakaoOauthService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    @Inject(MEMBER_REPOSITORY)
    private readonly memberRepository: MemberRepository,
    @Inject(OAUTH_REPOSITORY)
    private readonly oauthConnectionRepository: OauthRepository,
    @Inject(MEMBER_READ_REPOSITORY)
    private readonly memberReadRepository: MemberReadRepository,
    @Inject(PASSWORD_ENCODER)
    private readonly passwordEncoder: PasswordEncoder,
    private readonly em: EntityManager,
  ) {}

  async handleCallback(code: string) {
    const kakaoTokens =
      await this.kakaoOAuthService.exchangeCodeForAccessToken(code);

    const kakaoUser = await this.kakaoOAuthService.getUserInfo(
      kakaoTokens.access_token,
    );

    const { member, isNewMember, nickname } =
      await this.findOrCreateMember(kakaoUser);

    await this.updateActivityLog(member.id);

    const accessToken = this.jwtService.generateAccessToken(
      member.id,
      member.email.value,
    );

    const refreshToken = await this.refreshTokenService.create(member.id);

    await this.em.flush();

    return {
      accessToken: accessToken.accessToken,
      refreshToken,
      accessTokenExpiresIn: accessToken.expiresIn,
      memberId: member.id,
      isNewMember,
      // 신규 회원일 경우 닉네임 포함 (웰컴 메시지용)
      ...(isNewMember && { nickname }),
    };
  }

  private async findOrCreateMember(
    kakaoUser: KakaoUserInfo,
  ): Promise<{ member: Member; isNewMember: boolean; nickname: string }> {
    const { kakaoId, email, nickname } =
      this.extractKakaoUserProfile(kakaoUser);

    const existingConnection =
      await this.oauthConnectionRepository.findByProviderAndProviderId(
        "kakao",
        kakaoId,
      );

    if (existingConnection) {
      const member = await this.memberRepository.findById(
        existingConnection.memberId,
      );

      if (!member) {
        await this.oauthConnectionRepository.disconnect(existingConnection.id);
        throw new BadRequestException(
          "회원 정보를 찾을 수 없습니다. 다시 로그인해주세요.",
        );
      }

      return { member, isNewMember: false, nickname };
    }

    const existingMember = await this.memberRepository.findByEmail(email);

    if (existingMember) {
      const connection = OAuthConnection.connect({
        memberId: existingMember.id,
        provider: "kakao",
        providerId: kakaoId,
        email,
      });

      this.oauthConnectionRepository.save(connection);

      return { member: existingMember, isNewMember: false, nickname };
    }

    const newMember = await this.createNewMember(email, nickname);

    const connection = OAuthConnection.connect({
      memberId: newMember.id,
      provider: "kakao",
      providerId: kakaoId,
      email,
    });

    this.oauthConnectionRepository.save(connection);

    return { member: newMember, isNewMember: true, nickname };
  }

  /**
   * 카카오 사용자 정보에서 필수 필드 추출 및 검증
   * - email: 필수 (Member.email)
   * - nickname: 필수 (Member.nickname)
   */
  private extractKakaoUserProfile(kakaoUser: KakaoUserInfo): KakaoUserProfile {
    const kakaoId = String(kakaoUser.id);
    const email = kakaoUser.kakao_account?.email;
    const nickname = kakaoUser.kakao_account?.profile?.nickname;

    // 이메일 검증
    if (!email) {
      throw new BadRequestException(
        '이메일 정보가 필요합니다. 카카오 동의항목에서 "카카오계정(이메일)"을 필수 동의로 설정해주세요.',
      );
    }

    // 닉네임 검증
    if (!nickname) {
      throw new BadRequestException(
        '닉네임 정보가 필요합니다. 카카오 동의항목에서 "닉네임"을 필수 동의로 설정해주세요.',
      );
    }

    return { kakaoId, email, nickname };
  }

  /**
   * 신규 Member 생성 (OAuth 전용)
   * - 임시 비밀번호 생성 (사용자는 이후 비밀번호 설정 가능)
   */
  private async createNewMember(
    email: string,
    nickname: string,
  ): Promise<Member> {
    // OAuth 회원용 임시 비밀번호 생성 (랜덤 UUID)
    const tempPassword = crypto.randomUUID();

    const member = Member.register(
      {
        email,
        password: tempPassword,
        nickname,
        job: "미설정",
        notification: NotificationEnum.EMAIL,
        frequency: FrequencyEnum.EVERY,
      },
      this.passwordEncoder,
    );

    this.memberRepository.register(member);

    return member;
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
