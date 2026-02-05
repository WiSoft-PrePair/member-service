import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class CreateQuestionDto {
  @IsString()
  job: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  count?: number;
}
