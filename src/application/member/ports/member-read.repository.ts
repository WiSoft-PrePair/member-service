import { MemberReadDto } from "@/application/member/ports/member-read.dto";

export interface MemberReadRepository {
  save(entity: MemberReadDto): void;

  findById(id: string): Promise<MemberReadDto | null>;

  findByEmail(email: string): Promise<MemberReadDto | null>;

  findAll(options?: {
    limit?: number;
    offset?: number;
  }): Promise<MemberReadDto[]>;

  withdraw(id: string): Promise<number>;
}

export const MEMBER_READ_REPOSITORY = Symbol("MemberReadRepository");
