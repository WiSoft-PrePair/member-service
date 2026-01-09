import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { randomUUID } from "crypto";
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from "@/application/auth/ports";
import { RefreshTokenEntity } from "@/adapter/auth/persistence/entity/refresh-token.entity";

@Injectable()
export class RefreshTokenService {
  private readonly REFRESH_TOKEN_EXPIRES_IN: number = 7 * 24 * 60 * 60 * 1000;

  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepository: RefreshTokenRepository,
  ) {}

  async create(memberId: string): Promise<string> {
    const token: string = randomBytes(64).toString("hex");
    const expiresAt: Date = new Date(
      Date.now() + this.REFRESH_TOKEN_EXPIRES_IN,
    );

    await this.refreshTokenRepository.save({
      id: randomUUID(),
      memberId,
      token,
      expiresAt,
      createdAt: new Date(),
    });

    return token;
  }

  async verify(token: string): Promise<string> {
    const refreshToken: RefreshTokenEntity | null =
      await this.refreshTokenRepository.findByToken(token);

    if (!refreshToken) {
      throw new UnauthorizedException("유효하지 않은 Refresh Token입니다.");
    }

    if (refreshToken.expiresAt < new Date()) {
      await this.refreshTokenRepository.deleteByToken(refreshToken.id);

      throw new UnauthorizedException("만료된 Refresh Token입니다.");
    }

    return refreshToken.memberId;
  }

  async rotate(oldToken: string, memberId: string): Promise<string> {
    await this.refreshTokenRepository.deleteByToken(oldToken);

    return this.create(memberId);
  }

  async revoke(token: string): Promise<void> {
    await this.refreshTokenRepository.deleteByToken(token);
  }

  async revokeAll(memberId: string): Promise<void> {
    await this.refreshTokenRepository.deleteByMemberId(memberId);
  }
}
