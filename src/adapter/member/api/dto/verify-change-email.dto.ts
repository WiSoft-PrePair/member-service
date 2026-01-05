import { IsString, Length } from "class-validator";

export class VerifyChangeEmailDto {
  @IsString()
  @Length(4, 4, { message: "인증 코드는 4자리여야 합니다." })
  code: string;
}
