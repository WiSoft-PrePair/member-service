import { IsEmail, IsString, Length } from "class-validator";

export class ResetPasswordDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(4, 4)
  verificationCode!: string;
}
