import { IsInt, Min } from "class-validator";

export class AddPointDto {
  @IsInt()
  @Min(1)
  point!: number;
}
