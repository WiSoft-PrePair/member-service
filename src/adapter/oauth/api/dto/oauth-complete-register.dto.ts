import { IsNotEmpty, IsString } from "class-validator";

export class OauthCompleteRegisterDto {
  @IsString()
  @IsNotEmpty()
  registrationToken!: string;

  @IsString()
  @IsNotEmpty()
  job!: string;
}
