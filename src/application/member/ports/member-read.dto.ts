export class MemberReadDto {
  readonly id: string;
  readonly email: string;
  readonly job: string;
  readonly nickname: string;
  readonly point: number;
  readonly isPro: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly activity?: string[];
  readonly kakaoAccessToken?: string | null;

  constructor(data: {
    id: string;
    email: string;
    job: string;
    nickname: string;
    point: number;
    isPro: boolean;
    createdAt: Date;
    updatedAt: Date;
    activity?: string[];
    kakaoAccessToken?: string | null;
  }) {
    Object.assign(this, data);
    Object.freeze(this);
  }
}
