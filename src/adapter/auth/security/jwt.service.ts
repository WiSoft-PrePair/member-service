import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService as NestJwtService } from "@nestjs/jwt";

export interface JwtPayload {
  sub: string;
  email: string;
}

export interface TokenResponse {
  accessToken: string;
  expiresIn: number;
}

@Injectable()
export class JwtService {
  private readonly accessTokenExpiresIn: number;

  constructor(
    private readonly jwtService: NestJwtService,
    private readonly configService: ConfigService,
  ) {
    const expiresIn: string = this.configService.get<string>(
      "JWT_ACCESS_TOKEN_EXPIRES_IN",
      "15m",
    );

    this.accessTokenExpiresIn = this.pareExpiresIn(expiresIn);
  }

  generateAccessToken(memberId: string, email: string): TokenResponse {
    const payload: JwtPayload = {
      sub: memberId,
      email,
    };

    const accessToken: string = this.jwtService.sign(payload);

    return {
      accessToken,
      expiresIn: this.accessTokenExpiresIn,
    };
  }

  verify(token: string) {
    return this.jwtService.verify<JwtPayload>(token);
  }

  private pareExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);

    if (!match) {
      return 9000;
    }

    const value: number = parseInt(match[1], 10);
    const unit: string = match[2];

    switch (unit) {
      case "m":
        return value * 60;
      case "h":
        return value * 60 * 60;
      case "d":
        return value * 60 * 60 * 24;
      default:
        return 900;
    }
  }
}
