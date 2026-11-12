import { IsEmail, IsString, MinLength } from "class-validator";

export class RegisterMemberDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  job!: string;

  @IsString()
  nickname!: string;
}
