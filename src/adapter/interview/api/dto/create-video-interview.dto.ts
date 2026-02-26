import { IsInt, Max, Min } from "class-validator";

export class CreateVideoInterviewDto {
  @IsInt()
  @Min(1)
  @Max(10)
  questionCount!: number;
}
