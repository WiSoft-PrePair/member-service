import { RefreshTokenEntity } from "@/adapter/auth/presistence/entity/refresh-token.entity";

export interface RefreshTokenRepository {
  save(entity: RefreshTokenEntity): Promise<void>;

  findByToken(token: string): Promise<RefreshTokenEntity | null>;

  delete(id: string): Promise<void>;

  deleteByToken(token: string): Promise<void>;

  deleteByMemberId(memberId: string): Promise<void>;
}

export const REFRESH_TOKEN_REPOSITORY = Symbol("RefreshTokenRepository");
