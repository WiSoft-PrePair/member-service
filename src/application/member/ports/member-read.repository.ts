import { MemberReadEntity } from "@/adapter/member/persistence/read/entity/member-read.entity";

export interface MemberReadRepository {
  save(entity: MemberReadEntity): void;

  findById(id: string): Promise<MemberReadEntity | null>;

  findByEmail(email: string): Promise<MemberReadEntity | null>;

  findAll(options?: {
    limit?: number;
    offset?: number;
  }): Promise<MemberReadEntity[]>;

  withdraw(id: string): Promise<number>;
}

export const MEMBER_READ_REPOSITORY = Symbol("MemberReadRepository");
