import { IsIn, IsOptional, IsString } from "class-validator";
import { JOBS, type Job } from "@/domain/member";

export class UpdateMemberDto {
  @IsOptional()
  @IsIn(JOBS)
  job?: Job;

  @IsOptional()
  @IsString()
  nickname?: string;
}
