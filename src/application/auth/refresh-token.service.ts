import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { randomUUID } from "crypto";
import {
  REFRESH_TOKEN_REPOSITORY,
  RefreshTokenDto,
  type RefreshTokenRepository,
} from "@/application/auth/ports";
import { RefreshTokenEntity } from "@/adapter/auth/persistence/entity/refresh-token.entity";

@Injectable()
export class RefreshTokenService {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepository: RefreshTokenRepository,
  ) {}

  async create(memberId: string): Promise<string> {
    const token: string = randomBytes(64).toString("hex");

    const dto = new RefreshTokenDto({
      id: randomUUID(),
      memberId,
      token,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    });

    await this.refreshTokenRepository.save(dto);

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
