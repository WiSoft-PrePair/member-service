export interface MemberPointUpdate {
  addPoint(memberId: string, point: number): Promise<void>;
}

export const MEMBER_POINT_UPDATE: symbol = Symbol("MemberPointUpdate");
