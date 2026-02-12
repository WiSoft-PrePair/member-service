import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from "class-validator";
import { AnswerTypeEnum } from "@/domain/interview/answer";

export class SubmitAnswerDto {
  @IsUUID()
  questionId!: string;

  @IsString()
  @MinLength(1)
  answer!: string;

  @IsEnum(AnswerTypeEnum)
  answerType!: AnswerTypeEnum;

  @IsOptional()
  @IsString()
  mediaUrl?: string;
}
