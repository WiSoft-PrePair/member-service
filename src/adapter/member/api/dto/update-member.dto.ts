import { IsOptional, IsString } from "class-validator";

export class UpdateMemberDto {
  @IsOptional()
  @IsString()
  job?: string;

  @IsOptional()
  @IsString()
  nickname?: string;
}
