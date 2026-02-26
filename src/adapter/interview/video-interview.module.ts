import { Module } from "@nestjs/common";
import { VideoInterviewController } from "@/adapter/interview/api/video-interview.controller";
import { VideoInterviewPrismaRepository } from "@/adapter/interview/persistence/video-interview-prisma.repository";
import { INTERVIEW_QUESTION_REPOSITORY } from "@/domain/interview/question";
import { InterviewQuestionPrismaRepository } from "@/adapter/interview/persistence/interview-question-prisma.repository";
import { INTERVIEW_ANSWER_REPOSITORY } from "@/domain/interview/answer";
import { InterviewAnswerPrismaRepository } from "@/adapter/interview/persistence/interview-answer-prisma.repository";
import { INTERVIEW_FEEDBACK_REPOSITORY } from "@/domain/interview/feedback";
import { InterviewFeedbackPrismaRepository } from "@/adapter/interview/persistence/interview-feedback-prisma.repository";
import {
  AI_QUESTION_GENERATOR,
  AI_SCORING_PORT,
  FACIAL_EXPRESSION_ANALYSIS_PORT,
  OVERALL_FEEDBACK_PORT,
  S3_STORAGE_PORT,
  STT_PORT,
  VIDEO_PROCESSING_PORT,
} from "@/application/interview/ports";
import { OpenaiQuestionGeneratorService } from "@/adapter/interview/ai/openai-question-generator.service";
import { AIScoringAdapter } from "@/adapter/interview/ai/ai-scoring.adapter";
import { FacialExpressionAnalysisAdapter } from "@/adapter/interview/ai/facial-expression-analysis.adapter";
import { OverallFeedbackAdapter } from "@/adapter/interview/ai/overall-feedback.adapter";
import { S3StorageAdapter } from "@/adapter/interview/storage/s3-storage.adapter";
import { VideoInterviewService } from "@/application/interview/service/video-interveiw.service";
import { VIDEO_INTERVIEW_REPOSITORY } from "@/domain/interview/video/video-interview.repository";
import { FfmpegVideoProcessingAdapter } from "@/adapter/interview/video/ffmpeg-video-processing.adapter";
import { STTAdapter } from "@/adapter/interview/ai/stt.adapter";

@Module({
  controllers: [VideoInterviewController],
  providers: [
    VideoInterviewService,

    // Repositories
    {
      provide: VIDEO_INTERVIEW_REPOSITORY,
      useClass: VideoInterviewPrismaRepository,
    },
    {
      provide: INTERVIEW_QUESTION_REPOSITORY,
      useClass: InterviewQuestionPrismaRepository,
    },
    {
      provide: INTERVIEW_ANSWER_REPOSITORY,
      useClass: InterviewAnswerPrismaRepository,
    },
    {
      provide: INTERVIEW_FEEDBACK_REPOSITORY,
      useClass: InterviewFeedbackPrismaRepository,
    },

    // AI Ports
    {
      provide: AI_QUESTION_GENERATOR,
      useClass: OpenaiQuestionGeneratorService,
    },
    {
      provide: AI_SCORING_PORT,
      useClass: AIScoringAdapter,
    },
    {
      provide: FACIAL_EXPRESSION_ANALYSIS_PORT,
      useClass: FacialExpressionAnalysisAdapter,
    },
    {
      provide: OVERALL_FEEDBACK_PORT,
      useClass: OverallFeedbackAdapter,
    },

    // Infrastructure Ports
    {
      provide: S3_STORAGE_PORT,
      useClass: S3StorageAdapter,
    },
    {
      provide: VIDEO_PROCESSING_PORT,
      useClass: FfmpegVideoProcessingAdapter,
    },
    {
      provide: STT_PORT,
      useClass: STTAdapter,
    },
  ],
})
export class VideoInterviewModule {}
