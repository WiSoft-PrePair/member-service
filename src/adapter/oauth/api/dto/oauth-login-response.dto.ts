export class OauthLoginResponseDto {
  accessToken!: string;
  refreshToken!: string;
  accessTokenExpiresIn!: number;
  memberId!: string;
  isNewMember!: boolean;
  nickname?: string;
}
