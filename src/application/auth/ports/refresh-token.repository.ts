import { RefreshTokenDto } from "@/application/auth/ports/refresh-token.dto";

export interface RefreshTokenRepository {
  save(dto: RefreshTokenDto): Promise<void>;

  findByToken(token: string): Promise<RefreshTokenDto | null>;

  delete(id: string): Promise<void>;

  deleteByToken(token: string): Promise<void>;

  deleteByMemberId(memberId: string): Promise<void>;
}

export const REFRESH_TOKEN_REPOSITORY = Symbol("RefreshTokenRepository");
