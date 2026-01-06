import { FrequencyEnum, NotificationEnum } from "@/domain/member";
import { IsEmail, IsEnum, IsString, MinLength } from "class-validator";

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

  @IsEnum(NotificationEnum)
  notification!: NotificationEnum;

  @IsEnum(FrequencyEnum)
  frequency!: FrequencyEnum;
}
