import { FrequencyEnum, NotificationEnum } from "@/domain/member";
import { IsEmail, IsString } from "class-validator";

export class RegisterMemberRequestDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  @IsString()
  job!: string;

  @IsString()
  nickname!: string;

  @IsString()
  notification!: NotificationEnum;

  @IsString()
  frequency!: FrequencyEnum;
}
