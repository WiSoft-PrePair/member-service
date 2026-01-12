import { type EmailVerificationPurpose } from "@/application/member";
import { IsEmail, IsIn } from "class-validator";

export class SendEmailVerificationDto {
  @IsEmail()
  email: string;

  @IsIn(["REGISTER", "CHANGE_EMAIL", "PASSWORD_RESET"])
  purpose: EmailVerificationPurpose;
}
