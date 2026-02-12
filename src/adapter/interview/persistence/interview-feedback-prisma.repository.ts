import { Injectable } from "@nestjs/common";
import {
  InterviewFeedback,
  type InterviewFeedbackContent,
  type InterviewFeedbackRepository,
} from "@/domain/interview/feedback";
import { PrismaService } from "@/adapter/shared/prisma";

@Injectable()
export class InterviewFeedbackPrismaRepository
  implements InterviewFeedbackRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async save(feedback: InterviewFeedback): Promise<void> {
    await this.prisma.interviewFeedback.create({
      data: {
        id: feedback.id,
        answerId: feedback.answerId,
        feedback: JSON.stringify(feedback.feedback),
        score: feedback.score,
        createdAt: feedback.createdAt,
      },
    });
  }

  async findByAnswerId(answerId: string): Promise<InterviewFeedback | null> {
    const record = await this.prisma.interviewFeedback.findUnique({
      where: { answerId },
    });

    if (!record) return null;

    return InterviewFeedback.of({
      id: record.id,
      answerId: record.answerId,
      feedback: JSON.parse(record.feedback) as InterviewFeedbackContent,
      score: record.score,
      createdAt: record.createdAt,
    });
  }

  async findByAnswerIds(answerIds: string[]): Promise<InterviewFeedback[]> {
    const records = await this.prisma.interviewFeedback.findMany({
      where: { answerId: { in: answerIds } },
    });

    return records.map((record) =>
      InterviewFeedback.of({
        id: record.id,
        answerId: record.answerId,
        feedback: JSON.parse(record.feedback) as InterviewFeedbackContent,
        score: record.score,
        createdAt: record.createdAt,
      }),
    );
  }
}
