import { VideoInterviewStatusEnum } from "@/domain/interview/video/enums";

export type VideoInterviewType = {
  id: string;
  userId: string;
  questionCount: number;
  status: VideoInterviewStatusEnum;
  createdAt: Date;
  completedAt: Date | null;
};

export type CreatedVideoInterviewRequest = {
  userId: string;
  questionCount: number;
};
