import { IsEnum, IsNotEmpty, IsString } from "class-validator";
import { FrequencyEnum, NotificationEnum } from "@/domain/member";

export class OauthCompleteRegisterDto {
  @IsString()
  @IsNotEmpty()
  registrationToken!: string;

  @IsString()
  @IsNotEmpty()
  job!: string;

  @IsEnum(NotificationEnum)
  notification!: NotificationEnum;

  @IsEnum(FrequencyEnum)
  frequency!: FrequencyEnum;
}
