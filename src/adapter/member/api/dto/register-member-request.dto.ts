import { FrequencyEnum, NotificationEnum } from "@/domain/member";
import { IsEmail, IsEnum, IsString } from "class-validator";

export class RegisterMemberRequestDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  @IsString()
  job!: string;

  @IsString()
  nickname!: string;

  @IsEnum(NotificationEnum)
  notification!: NotificationEnum;

  @IsEnum(FrequencyEnum)
  frequency!: FrequencyEnum;
}
