import { Member } from "@/domain/member/member";

export interface MemberRepository {
  register(member: Member): Member;
}

export const MEMBER_REPOSITORY = Symbol("MemberRepository");
