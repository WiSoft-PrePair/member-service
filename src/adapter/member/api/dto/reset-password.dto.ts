import { IsEmail, IsString, Length, MinLength } from "class-validator";

export class ResetPasswordDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 6)
  verificationCode!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
