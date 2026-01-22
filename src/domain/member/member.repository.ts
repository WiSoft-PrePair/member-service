import { Member } from "@/domain/member/member";

export interface MemberRepository {
  register(member: Member): Promise<Member>;

  withdraw(memberId: string): Promise<void>;

  update(member: Member): Promise<Member>;

  findById(id: string): Promise<Member | null>;

  findByEmail(email: string): Promise<Member | null>;
}

export const MEMBER_REPOSITORY = Symbol("MemberRepository");
