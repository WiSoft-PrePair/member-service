import { Injectable } from "@nestjs/common";
import {
  InterviewQuestion,
  InterviewQuestionRepository,
} from "@/domain/interview/question";
import { PrismaService } from "@/adapter/shared/prisma";

@Injectable()
export class InterviewQuestionPrismaRepository
  implements InterviewQuestionRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async save(question: InterviewQuestion): Promise<void> {
    await this.prisma.interviewQuestion.create({
      data: {
        id: question.id,
        userId: question.userId,
        question: question.question,
        questionType: question.questionType,
        questionTag: question.questionTag,
        status: question.status,
        score: question.score,
        sourceRef: question.sourceRef,
        createdAt: question.createdAt,
      },
    });
  }
}
