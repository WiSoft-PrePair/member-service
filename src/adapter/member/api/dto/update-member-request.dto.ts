import { FrequencyEnum, NotificationEnum } from "@/domain/member";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class UpdateMemberRequestDto {
  @IsOptional()
  @IsString()
  job?: string;

  @IsOptional()
  @IsString()
  nickname?: string;

  @IsOptional()
  @IsEnum(NotificationEnum)
  notification?: NotificationEnum;

  @IsOptional()
  @IsEnum(FrequencyEnum)
  frequency?: FrequencyEnum;
}
