import { Member } from "@/domain/member/member";

export interface MemberRepository {
  register(member: Member): Member;

  withdraw(memberId: string): void;

  update(member: Member): Member;

  findById(id: string): Promise<Member | null>;
}

export const MEMBER_REPOSITORY = Symbol("MemberRepository");
