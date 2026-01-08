import { OAuthProvider } from "@/domain/oauth";

export interface KakaoTokenResponse {
  token_type: "bearer";
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in: number;
  scope?: string;
}

export interface KakaoUserInfo {
  id: number;
  connected_at: string;
  kakao_account?: {
    // 닉네임 관련 (필수 동의 항목으로 설정 필요)
    profile_nickname_needs_agreement?: boolean;
    profile?: {
      nickname?: string; // 카카오 닉네임 → Member.nickname에 사용
      is_default_nickname?: boolean; // 기본 닉네임 여부
      thumbnail_image_url?: string;
      profile_image_url?: string;
      is_default_image?: boolean;
    };
    // 이메일 관련 (필수 동의 항목으로 설정 필요)
    email_needs_agreement?: boolean;
    is_email_valid?: boolean;
    is_email_verified?: boolean;
    email?: string; // 카카오 이메일 → Member.email에 사용
  };
}

export interface KakaoUserProfile {
  kakaoId: string;
  email: string;
  nickname: string;
}

export interface OAuthRegistrationPayload {
  email: string;
  nickname: string;
  provider: OAuthProvider;
  providerId: string;
  type: "oauth_registration";
}
