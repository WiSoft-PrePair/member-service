export class RefreshTokenDto {
  readonly id: string;
  readonly memberId: string;
  readonly token: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;

  constructor(data: {
    id: string;
    memberId: string;
    token: string;
    expiresAt: Date;
    createdAt: Date;
  }) {
    Object.assign(this, data);
    Object.freeze(this);
  }
}
