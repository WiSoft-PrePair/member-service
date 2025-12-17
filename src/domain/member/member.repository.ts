import { Member } from "@/domain/member/member";

export interface MemberRepository {
  save(member: Member): Member;
}

export const MEMBER_REPOSITORY = Symbol("MemberRepository");
