import { VideoInterview } from "@/domain/interview/video/video-interview";

export interface VideoInterviewRepository {
  save(videoInterview: VideoInterview): Promise<void>;
  findById(id: string): Promise<VideoInterview | null>;
  findByUserId(userId: string): Promise<VideoInterview[]>;
  update(videoInterview: VideoInterview): Promise<void>;
}

export const VIDEO_INTERVIEW_REPOSITORY: symbol = Symbol(
  "VideoInterviewRepository",
);
