import { IsEmail, IsIn, IsString, MinLength } from "class-validator";
import { JOBS, type Job } from "@/domain/member";

export class RegisterMemberDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsIn(JOBS)
  job!: Job;

  @IsString()
  nickname!: string;
}
