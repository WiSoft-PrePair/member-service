import { IsInt, IsString, IsUUID, Min } from "class-validator";

export class UpdateScoreDto {
  @IsString()
  @IsUUID()
  memberId: string;

  @IsInt()
  @Min(1)
  score!: number;
}
