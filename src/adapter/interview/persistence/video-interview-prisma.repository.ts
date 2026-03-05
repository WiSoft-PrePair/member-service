import { Injectable } from "@nestjs/common";
import { VideoInterviewRepository } from "@/domain/interview/video/video-interview.repository";
import { VideoInterview } from "@/domain/interview/video/video-interview";
import { PrismaService } from "@/adapter/shared/prisma";
import { VideoInterviewStatusEnum } from "@/domain/interview/video/enums";

@Injectable()
export class VideoInterviewPrismaRepository implements VideoInterviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(videoInterview: VideoInterview): Promise<void> {
    await this.prisma.videoInterview.create({
      data: {
        id: videoInterview.id,
        userId: videoInterview.userId,
        questionCount: videoInterview.questionCount,
        status: videoInterview.status,
        createdAt: videoInterview.createdAt,
        completedAt: videoInterview.completedAt,
      },
    });
  }

  async findById(id: string): Promise<VideoInterview | null> {
    const record = await this.prisma.videoInterview.findUnique({
      where: { id },
    });

    if (!record) return null;

    return VideoInterview.of({
      id: record.id,
      userId: record.userId,
      questionCount: record.questionCount,
      status: record.status as VideoInterviewStatusEnum,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
    });
  }

  async findByUserId(userId: string): Promise<VideoInterview[]> {
    const records = await this.prisma.videoInterview.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return records.map((r) =>
      VideoInterview.of({
        id: r.id,
        userId: r.userId,
        questionCount: r.questionCount,
        status: r.status as VideoInterviewStatusEnum,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
      }),
    );
  }

  async update(videoInterview: VideoInterview): Promise<void> {
    await this.prisma.videoInterview.update({
      where: { id: videoInterview.id },
      data: {
        status: videoInterview.status,
        completedAt: videoInterview.completedAt,
      },
    });
  }
}
