import { IsEmail, IsNotEmpty } from "class-validator";

export class RequestChangeEmailDto {
  @IsEmail({}, { message: "올바른 이메일 형식이 아닙니다." })
  @IsNotEmpty({ message: "이메일은 필수입니다." })
  newEmail: string;
}
