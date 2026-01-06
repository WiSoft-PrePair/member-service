import { IsEmail, Length } from "class-validator";

export class VerifyEmailDto {
  @IsEmail()
  email: string;

  @Length(4, 4)
  code: string;
}
