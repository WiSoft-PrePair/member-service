import { Injectable } from "@nestjs/common";
import {
  InterviewQuestion,
  InterviewQuestionRepository,
} from "@/domain/interview/question";
import { PrismaService } from "@/adapter/shared/prisma";
import {
  QuestionStatusEnum,
  QuestionTypeEnum,
} from "@/domain/interview/question/enums";

@Injectable()
export class InterviewQuestionPrismaRepository implements InterviewQuestionRepository {
  constructor(private readonly prisma: PrismaService) {}
  async save(question: InterviewQuestion): Promise<void> {
    await this.prisma.interviewQuestion.create({
      data: {
        id: question.id,
        userId: question.userId,
        videoInterviewId: question.videoInterviewId,
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

  async findById(id: string): Promise<InterviewQuestion | null> {
    const record = await this.prisma.interviewQuestion.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return InterviewQuestion.of({
      id: record.id,
      userId: record.userId,
      videoInterviewId: record.videoInterviewId,
      question: record.question,
      questionType: record.questionType as QuestionTypeEnum,
      questionTag: record.questionTag,
      status: record.status as QuestionStatusEnum,
      score: record.score,
      sourceRef: record.sourceRef,
      createdAt: record.createdAt,
    });
  }

  async update(question: InterviewQuestion): Promise<void> {
    await this.prisma.interviewQuestion.update({
      where: { id: question.id },
      data: {
        status: question.status,
        score: question.score,
      },
    });
  }

  async findByVideoInterviewId(
    videoInterviewId: string,
  ): Promise<InterviewQuestion[]> {
    const records = await this.prisma.interviewQuestion.findMany({
      where: { videoInterviewId },
      orderBy: { createdAt: "asc" },
    });

    return records.map((r) =>
      InterviewQuestion.of({
        id: r.id,
        userId: r.userId,
        videoInterviewId: r.videoInterviewId,
        question: r.question,
        questionType: r.questionType as QuestionTypeEnum,
        questionTag: r.questionTag,
        status: r.status as QuestionStatusEnum,
        score: r.score,
        sourceRef: r.sourceRef,
        createdAt: r.createdAt,
      }),
    );
  }
}
