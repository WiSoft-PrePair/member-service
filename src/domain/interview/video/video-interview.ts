import { VideoInterviewStatusEnum } from "@/domain/interview/video/enums";
import {
  CreatedVideoInterviewRequest,
  VideoInterviewType,
} from "@/domain/interview/video/types";
import { randomUUID } from "crypto";

export class VideoInterview {
  readonly id: string;
  readonly userId: string;
  readonly questionCount: number;
  readonly status: VideoInterviewStatusEnum;
  readonly createdAt: Date;
  readonly completedAt: Date | null;

  private constructor(data: VideoInterviewType) {
    Object.assign(this, data);
  }

  public static create(request: CreatedVideoInterviewRequest): VideoInterview {
    return new VideoInterview({
      id: randomUUID(),
      userId: request.userId,
      questionCount: request.questionCount,
      status: VideoInterviewStatusEnum.GENERATING,
      createdAt: new Date(),
      completedAt: null,
    });
  }

  public videoInterviewStatusReady(): VideoInterview {
    return new VideoInterview({
      ...this,
      status: VideoInterviewStatusEnum.IN_PROGRESS,
    });
  }

  public videoInterviewStatusCompleted(): VideoInterview {
    return new VideoInterview({
      ...this,
      status: VideoInterviewStatusEnum.COMPLETED,
      completedAt: new Date(),
    });
  }

  public static of(data: VideoInterviewType): VideoInterview {
    return new VideoInterview(data);
  }
}
