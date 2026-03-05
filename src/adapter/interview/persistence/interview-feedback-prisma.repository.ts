import { Injectable } from "@nestjs/common";
import {
  InterviewFeedback,
  type InterviewFeedbackRepository,
} from "@/domain/interview/feedback";
import { FeedbackTypeEnum } from "@/domain/interview/feedback/enums";
import { PrismaService } from "@/adapter/shared/prisma";

@Injectable()
export class InterviewFeedbackPrismaRepository implements InterviewFeedbackRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(feedback: InterviewFeedback): Promise<void> {
    await this.prisma.interviewFeedback.create({
      data: {
        id: feedback.id,
        answerId: feedback.answerId,
        feedbackType: feedback.feedbackType,
        feedback: JSON.stringify(feedback.feedback),
        score: feedback.score,
        createdAt: feedback.createdAt,
      },
    });
  }

  async findByAnswerId(answerId: string): Promise<InterviewFeedback | null> {
    const record = await this.prisma.interviewFeedback.findFirst({
      where: { answerId, feedbackType: FeedbackTypeEnum.CONTENT },
    });

    if (!record) return null;
    return this.toDomain(record);
  }

  async findByAnswerIds(answerIds: string[]): Promise<InterviewFeedback[]> {
    const records = await this.prisma.interviewFeedback.findMany({
      where: { answerId: { in: answerIds } },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findAllByAnswerId(answerId: string): Promise<InterviewFeedback[]> {
    const records = await this.prisma.interviewFeedback.findMany({
      where: { answerId },
      orderBy: { createdAt: "asc" },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findByAnswerIdAndType(
    answerId: string,
    type: FeedbackTypeEnum,
  ): Promise<InterviewFeedback | null> {
    const record = await this.prisma.interviewFeedback.findUnique({
      where: { answerId_feedbackType: { answerId, feedbackType: type } },
    });

    if (!record) return null;
    return this.toDomain(record);
  }

  private toDomain(record: {
    id: string;
    answerId: string;
    feedbackType: string;
    feedback: string;
    score: number;
    createdAt: Date;
  }): InterviewFeedback {
    return InterviewFeedback.of({
      id: record.id,
      answerId: record.answerId,
      feedbackType: record.feedbackType as FeedbackTypeEnum,
      feedback: JSON.parse(record.feedback),
      score: record.score,
      createdAt: record.createdAt,
    });
  }
}
