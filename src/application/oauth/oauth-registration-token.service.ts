import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService as NestJwtService } from "@nestjs/jwt";
import { OAuthProvider } from "@/domain/oauth";
import { OAuthRegistrationPayload } from "@/application/oauth/types";

export interface RegistrationTokenData {
  email: string;
  nickname: string;
  provider: OAuthProvider;
  providerId: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresIn: number;
}

@Injectable()
export class OAuthRegistrationTokenService {
  constructor(private readonly jwtService: NestJwtService) {}

  public generateRegistrationToken(data: RegistrationTokenData): string {
    const payload: OAuthRegistrationPayload = {
      ...data,
      type: "oauth_registration",
    };

    // JwtModule에 설정된 global secret과 expiresIn 사용
    return this.jwtService.sign(payload);
  }

  public verifyRegistrationToken(token: string): RegistrationTokenData {
    try {
      const payload: OAuthRegistrationPayload =
        this.jwtService.verify<OAuthRegistrationPayload>(token);

      if (payload.type !== "oauth_registration") {
        throw new UnauthorizedException("유효하지 않은 등록 토큰입니다.");
      }

      return {
        email: payload.email,
        nickname: payload.nickname,
        provider: payload.provider,
        providerId: payload.providerId,
        accessToken: payload.accessToken,
        refreshToken: payload.refreshToken,
        tokenExpiresIn: payload.tokenExpiresIn,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException(
        "등록 토큰이 만료되었거나 유효하지 않습니다. 다시 카카오 로그인을 진행해주세요.",
      );
    }
  }
}
