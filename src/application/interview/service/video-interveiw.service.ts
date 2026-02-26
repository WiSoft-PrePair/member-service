import {
  VIDEO_INTERVIEW_REPOSITORY,
  type VideoInterviewRepository,
} from "@/domain/interview/video/video-interview.repository";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  INTERVIEW_QUESTION_REPOSITORY,
  InterviewQuestion,
  type InterviewQuestionRepository,
} from "@/domain/interview/question";
import {
  AnswerTypeEnum,
  INTERVIEW_ANSWER_REPOSITORY,
  InterviewAnswer,
  type InterviewAnswerRepository,
} from "@/domain/interview/answer";
import {
  FeedbackTypeEnum,
  INTERVIEW_FEEDBACK_REPOSITORY,
  InterviewFeedback,
  type InterviewFeedbackRepository,
} from "@/domain/interview/feedback";
import {
  AI_QUESTION_GENERATOR,
  AI_SCORING_PORT,
  type AIQuestionGenerator,
  type AIScoringPort,
  FACIAL_EXPRESSION_ANALYSIS_PORT,
  type FacialExpressionAnalysisPort,
  OVERALL_FEEDBACK_PORT,
  type OverallFeedbackPort,
  S3_STORAGE_PORT,
  type S3StoragePort,
  STT_PORT,
  type STTPort,
  VIDEO_PROCESSING_PORT,
  type VideoProcessingPort,
} from "@/application/interview/ports";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";
import { VideoInterview } from "@/domain/interview/video/video-interview";
import { Observable } from "rxjs";
import { QuestionTypeEnum } from "@/domain/interview/question/enums";
import { VideoInterviewNoFoundException } from "@/domain/interview/video/exceptions";
import { randomUUID } from "crypto";

@Injectable()
export class VideoInterviewService {
  constructor(
    @Inject(VIDEO_INTERVIEW_REPOSITORY)
    private readonly videoInterviewRepository: VideoInterviewRepository,
    @Inject(INTERVIEW_QUESTION_REPOSITORY)
    private readonly questionRepository: InterviewQuestionRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY)
    private readonly answerRepository: InterviewAnswerRepository,
    @Inject(INTERVIEW_FEEDBACK_REPOSITORY)
    private readonly feedbackRepository: InterviewFeedbackRepository,
    @Inject(AI_QUESTION_GENERATOR)
    private readonly aiQuestionGenerator: AIQuestionGenerator,
    @Inject(AI_SCORING_PORT)
    private readonly aiScoring: AIScoringPort,
    @Inject(S3_STORAGE_PORT)
    private readonly s3Storage: S3StoragePort,
    @Inject(VIDEO_PROCESSING_PORT)
    private readonly videoProcessing: VideoProcessingPort,
    @Inject(STT_PORT)
    private readonly stt: STTPort,
    @Inject(FACIAL_EXPRESSION_ANALYSIS_PORT)
    private readonly expressionAnalysis: FacialExpressionAnalysisPort,
    @Inject(OVERALL_FEEDBACK_PORT)
    private readonly overallFeedback: OverallFeedbackPort,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  // ─── 화상 면접 생성 ───
  async createSession(
    userId: string,
    questionCount: number,
  ): Promise<VideoInterview> {
    const videoInterview = VideoInterview.create({ userId, questionCount });
    await this.videoInterviewRepository.save(videoInterview);

    this.logger.log("Interview session created", {
      module: "VideoInterviewService",
      videoInterviewId: videoInterview.id,
      userId,
      questionCount,
    });

    return videoInterview;
  }

  // ─── SSE 질문 스트리밍 ───
  streamQuestions(
    videoInterviewId: string,
    userId: string,
    job: string,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      (async () => {
        const videoInterview =
          await this.videoInterviewRepository.findById(videoInterviewId);
        if (!videoInterview || videoInterview.userId !== userId) {
          throw new VideoInterviewNoFoundException(videoInterviewId);
        }

        for (let i = 0; i < videoInterview.questionCount; i++) {
          const [generated] = await this.aiQuestionGenerator.generateQuestions(
            job,
            1,
          );

          const question = InterviewQuestion.createQuestion({
            userId,
            videoInterviewId,
            question: generated.question,
            questionType: QuestionTypeEnum.VIDEO,
            questionTag: generated.questionTag,
          });

          await this.questionRepository.save(question);

          subscriber.next({
            data: JSON.stringify({
              type: "question",
              index: i + 1,
              total: videoInterview.questionCount,
              question: {
                id: question.id,
                question: question.question,
                questionTag: question.questionTag,
              },
            }),
          } as MessageEvent);

          this.logger.log(
            `Question ${i + 1}/${videoInterview.questionCount} streamed`,
            {
              module: "VideoInterviewService",
              videoInterviewId,
              questionId: question.id,
            },
          );
        }

        // 화상 면접 상태 업데이트
        const updatedVideoInterview =
          videoInterview.videoInterviewStatusReady();
        await this.videoInterviewRepository.update(updatedVideoInterview);

        subscriber.next({
          data: JSON.stringify({ type: "complete" }),
        } as MessageEvent);
        subscriber.complete();
      })().catch((err) => subscriber.error(err));
    });
  }

  // ─── 영상 답변 업로드 ───
  async uploadVideoAnswer(
    userId: string,
    userEmail: string,
    videoInterviewId: string,
    questionId: string,
    file: Express.Multer.File,
  ): Promise<{ answerId: string; status: string }> {
    // 화상 면접 검증
    const videoInterview =
      await this.videoInterviewRepository.findById(videoInterviewId);
    if (!videoInterview || videoInterview.userId !== userId) {
      throw new VideoInterviewNoFoundException(videoInterviewId);
    }

    // 질문 검증
    const question = await this.questionRepository.findById(questionId);
    if (!question || question.userId !== userId) {
      throw new NotFoundException(`질문을 찾을 수 없습니다: ${questionId}`);
    }

    // S3 업로드
    const s3Key = `interview/${userEmail}/${questionId}/${randomUUID()}.webm`;
    const { url: mediaUrl } = await this.s3Storage.uploadVideo(
      file.buffer,
      s3Key,
      file.mimetype,
    );

    // Answer 저장
    const answer = InterviewAnswer.createAnswer({
      questionId,
      answer: "", // STT 처리 후 업데이트됨
      answerType: AnswerTypeEnum.VIDEO,
      mediaUrl,
    });
    await this.answerRepository.save(answer);

    this.logger.log("Video answer uploaded", {
      module: "VideoInterviewService",
      videoInterviewId,
      questionId,
      answerId: answer.id,
      s3Key,
    });

    // 비동기 분석 파이프라인 시작 (fire-and-forget)
    this.processVideoAnswer(
      answer.id,
      questionId,
      videoInterviewId,
      s3Key,
      question.question,
    ).catch((err) =>
      this.logger.error(
        "비디오 분석 파이프라인 실패",
        err instanceof Error ? err : undefined,
        {
          module: "VideoInterviewService",
          answerId: answer.id,
        },
      ),
    );

    return { answerId: answer.id, status: "processing" };
  }

  // ─── 비동기 비디오 분석 파이프라인 ───
  private async processVideoAnswer(
    answerId: string,
    questionId: string,
    videoInterviewId: string,
    s3Key: string,
    questionText: string,
  ): Promise<void> {
    this.logger.log("Video processing pipeline started", {
      module: "VideoInterviewService",
      answerId,
    });

    // 1. S3에서 영상 다운로드
    const videoBuffer = await this.s3Storage.downloadObject(s3Key);

    // 2. 프레임 추출 + 오디오 추출 병렬 실행
    const [extractedFrames, extractedAudio] = await Promise.all([
      this.videoProcessing.extractFrames(videoBuffer, 1),
      this.videoProcessing.extractAudio(videoBuffer),
    ]);

    // 3. 표정 분석 + (STT → 답변 채점) 병렬 실행
    const [expressionResult, { transcription, scoringResult }] =
      await Promise.all([
        this.expressionAnalysis.analyzeFrames(extractedFrames.frames),
        this.transcribeAndScore(
          extractedAudio.audio,
          extractedAudio.format,
          questionId,
          questionText,
        ),
      ]);

    // 4. EXPRESSION 피드백 저장
    const expressionFeedback = InterviewFeedback.create({
      answerId,
      feedbackType: FeedbackTypeEnum.EXPRESSION,
      feedback: {
        emotionSummary: expressionResult.summary,
        emotionTimeline: expressionResult.frameResults.map((f) => ({
          timestamp: f.timestamp,
          emotion: f.emotion,
          detail: f.detail,
        })),
        eyeContactScore: expressionResult.eyeContactScore,
        confidenceScore: expressionResult.confidenceScore,
        recommendations: expressionResult.recommendations,
      },
      score: expressionResult.score,
    });
    await this.feedbackRepository.save(expressionFeedback);

    // 5. CONTENT 피드백 저장
    const contentFeedback = InterviewFeedback.create({
      answerId,
      feedbackType: FeedbackTypeEnum.CONTENT,
      feedback: {
        strengths: scoringResult.feedback.strengths,
        improvements: scoringResult.feedback.improvements,
        recommendations: scoringResult.feedback.recommendations,
      },
      score: scoringResult.score,
    });
    await this.feedbackRepository.save(contentFeedback);

    // 6. 종합 피드백 생성 + 저장
    const overallResult = await this.overallFeedback.generateOverallFeedback({
      question: questionText,
      contentFeedback: {
        score: scoringResult.score,
        strengths: scoringResult.feedback.strengths,
        improvements: scoringResult.feedback.improvements,
        recommendations: scoringResult.feedback.recommendations,
      },
      expressionFeedback: {
        score: expressionResult.score,
        summary: expressionResult.summary,
        recommendations: expressionResult.recommendations,
      },
    });

    const overallFeedback = InterviewFeedback.create({
      answerId,
      feedbackType: FeedbackTypeEnum.OVERALL,
      feedback: {
        summary: overallResult.summary,
        contentScore: scoringResult.score,
        expressionScore: expressionResult.score,
        overallScore: overallResult.overallScore,
        strengths: overallResult.strengths,
        improvements: overallResult.improvements,
        recommendations: overallResult.recommendations,
      },
      score: overallResult.overallScore,
    });
    await this.feedbackRepository.save(overallFeedback);

    // 7. 질문 상태 업데이트
    const question = await this.questionRepository.findById(questionId);
    if (question) {
      const updatedQuestion = question.marksAnswered(
        overallResult.overallScore,
      );
      await this.questionRepository.update(updatedQuestion);
    }

    // 8. 화상 면접 완료 여부 체크
    await this.checkVideoInterviewCompletion(videoInterviewId);

    this.logger.log("Video processing pipeline completed", {
      module: "VideoInterviewService",
      answerId,
      overallScore: overallResult.overallScore,
    });
  }

  private async transcribeAndScore(
    audioBuffer: Buffer,
    format: string,
    questionId: string,
    questionText: string,
  ) {
    const transcription = await this.stt.transcribe(audioBuffer, format);

    const scoringResult = await this.aiScoring.scoreAnswer({
      questionId,
      question: questionText,
      answer: transcription.text,
    });

    return { transcription, scoringResult };
  }

  private async checkVideoInterviewCompletion(
    videoInterviewId: string,
  ): Promise<void> {
    const questions =
      await this.questionRepository.findByVideoInterviewId(videoInterviewId);
    const allAnswered = questions.every((q) => q.status === "answered");

    if (allAnswered) {
      const videoInterview =
        await this.videoInterviewRepository.findById(videoInterviewId);
      if (videoInterview) {
        const completedVideoInterview =
          videoInterview.videoInterviewStatusCompleted();
        await this.videoInterviewRepository.update(completedVideoInterview);
      }
    }
  }

  // ─── 화상 면접 결과 조회 ───
  async getSessionResult(videoInterviewId: string, userId: string) {
    const videoInterview =
      await this.videoInterviewRepository.findById(videoInterviewId);
    if (!videoInterview || videoInterview.userId !== userId) {
      throw new VideoInterviewNoFoundException(videoInterviewId);
    }

    const questions =
      await this.questionRepository.findByVideoInterviewId(videoInterviewId);

    const questionsWithFeedback = await Promise.all(
      questions.map(async (q) => {
        const answers = await this.answerRepository.findByQuestionId(q.id);
        const latestAnswer = answers[answers.length - 1] ?? null;

        let feedbacks: InterviewFeedback[] = [];
        if (latestAnswer) {
          feedbacks = await this.feedbackRepository.findAllByAnswerId(
            latestAnswer.id,
          );
        }

        const feedbackMap = new Map(feedbacks.map((f) => [f.feedbackType, f]));

        return {
          questionId: q.id,
          question: q.question,
          questionTag: q.questionTag,
          status: q.status,
          score: q.score,
          answer: latestAnswer
            ? {
                id: latestAnswer.id,
                mediaUrl: latestAnswer.mediaUrl,
                createdAt: latestAnswer.createdAt,
              }
            : null,
          feedbacks: {
            content: feedbackMap.get(FeedbackTypeEnum.CONTENT)
              ? {
                  score: feedbackMap.get(FeedbackTypeEnum.CONTENT)!.score,
                  feedback: feedbackMap.get(FeedbackTypeEnum.CONTENT)!.feedback,
                }
              : null,
            expression: feedbackMap.get(FeedbackTypeEnum.EXPRESSION)
              ? {
                  score: feedbackMap.get(FeedbackTypeEnum.EXPRESSION)!.score,
                  feedback: feedbackMap.get(FeedbackTypeEnum.EXPRESSION)!
                    .feedback,
                }
              : null,
            overall: feedbackMap.get(FeedbackTypeEnum.OVERALL)
              ? {
                  score: feedbackMap.get(FeedbackTypeEnum.OVERALL)!.score,
                  feedback: feedbackMap.get(FeedbackTypeEnum.OVERALL)!.feedback,
                }
              : null,
          },
        };
      }),
    );

    return {
      session: {
        id: videoInterview.id,
        status: videoInterview.status,
        questionCount: videoInterview.questionCount,
        createdAt: videoInterview.createdAt,
        completedAt: videoInterview.completedAt,
      },
      questions: questionsWithFeedback,
    };
  }

  // ─── 화상 면접 상태 조회 ───
  async getSession(videoInterviewId: string, userId: string) {
    const videoInterview =
      await this.videoInterviewRepository.findById(videoInterviewId);
    if (!videoInterview || videoInterview.userId !== userId) {
      throw new VideoInterviewNoFoundException(videoInterviewId);
    }

    const questions =
      await this.questionRepository.findByVideoInterviewId(videoInterviewId);

    return {
      id: videoInterview.id,
      status: videoInterview.status,
      questionCount: videoInterview.questionCount,
      createdAt: videoInterview.createdAt,
      completedAt: videoInterview.completedAt,
      questions: questions.map((q) => ({
        id: q.id,
        question: q.question,
        status: q.status,
        score: q.score,
      })),
    };
  }
}
