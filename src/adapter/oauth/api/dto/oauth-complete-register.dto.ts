import { IsIn, IsNotEmpty, IsString } from "class-validator";
import { JOBS, type Job } from "@/domain/member";

export class OauthCompleteRegisterDto {
  @IsString()
  @IsNotEmpty()
  registrationToken!: string;

  @IsIn(JOBS)
  job!: Job;
}
