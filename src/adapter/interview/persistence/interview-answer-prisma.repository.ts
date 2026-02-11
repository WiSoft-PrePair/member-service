import { Injectable } from "@nestjs/common";
import {
  AnswerTypeEnum,
  InterviewAnswer,
  InterviewAnswerRepository,
} from "@/domain/interview/answer";
import { PrismaService } from "@/adapter/shared/prisma";

@Injectable()
export class InterviewAnswerPrismaRepository implements InterviewAnswerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(answer: InterviewAnswer): Promise<void> {
    await this.prisma.interviewAnswer.create({
      data: {
        id: answer.id,
        interviewId: answer.interviewId,
        answer: answer.answer,
        answerType: answer.answerType,
        mediaUrl: answer.mediaUrl,
        createdAt: answer.createdAt,
      },
    });
  }

  async findByInterviewId(interviewId: string): Promise<InterviewAnswer[]> {
    const records = await this.prisma.interviewAnswer.findMany({
      where: { interviewId },
      orderBy: { createdAt: "asc" },
    });

    return records.map((r) =>
      InterviewAnswer.of({
        id: r.id,
        interviewId: r.interviewId,
        answer: r.answer,
        answerType: r.answerType as AnswerTypeEnum,
        mediaUrl: r.mediaUrl,
        createdAt: r.createdAt,
      }),
    );
  }

  async countByInterviewId(interviewId: string): Promise<number> {
    return this.prisma.interviewAnswer.count({
      where: { interviewId },
    });
  }
}
