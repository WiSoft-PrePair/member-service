import { Inject, Injectable } from "@nestjs/common";
import {
  AnswerTypeEnum,
  INTERVIEW_ANSWER_REPOSITORY,
  InterviewAnswer,
  type InterviewAnswerRepository,
  InterviewQuestionNotFoundException,
} from "@/domain/interview/answer";
import {
  INTERVIEW_QUESTION_REPOSITORY,
  InterviewQuestion,
  type InterviewQuestionRepository,
} from "@/domain/interview/question";
import {
  AI_SCORING_PORT,
  type AIScoringPort,
  MEMBER_POINT_UPDATE,
  type MemberPointUpdate,
  ScoringFeedback,
  ScoringResult,
} from "@/application/interview/ports";
import { type ILogger, LOGGER } from "@/adapter/shared/logger/logger.inferface";

@Injectable()
export class InterviewAnswerService {
  constructor(
    @Inject(INTERVIEW_ANSWER_REPOSITORY)
    private readonly interviewAnswerRepository: InterviewAnswerRepository,
    @Inject(INTERVIEW_QUESTION_REPOSITORY)
    private readonly interviewQuestionRepository: InterviewQuestionRepository,
    @Inject(AI_SCORING_PORT)
    private readonly aiScoring: AIScoringPort,
    @Inject(MEMBER_POINT_UPDATE)
    private readonly memberPointUpdate: MemberPointUpdate,
    @Inject(LOGGER)
    private readonly logger: ILogger,
  ) {}

  async submitAnswer(
    userId: string,
    questionId: string,
    answer: string,
    answerType: AnswerTypeEnum,
    mediaUrl?: string,
  ) {
    const question: InterviewQuestion | null =
      await this.interviewQuestionRepository.findById(questionId);

    if (!question || question.userId !== userId) {
      throw new InterviewQuestionNotFoundException(questionId);
    }

    const interviewAnswer: InterviewAnswer = InterviewAnswer.createAnswer({
      questionId,
      answer,
      answerType,
      mediaUrl,
    });

    await this.interviewAnswerRepository.save(interviewAnswer);

    let score: number | null = null;
    let feedback: ScoringFeedback | null = null;

    if (question.isFirstAnswer()) {
      const result: { score: number; feedback: ScoringFeedback } =
        await this.handleFirstAnswer(question, answer);
      score = result.score;
      feedback = result.feedback;
    }

    return {
      answerId: interviewAnswer.id,
      score,
      feedback,
    };
  }

  private async handleFirstAnswer(
    question: InterviewQuestion,
    answer: string,
  ): Promise<{ score: number; feedback: ScoringFeedback }> {
    let score: number = 0;
    let feedback: ScoringFeedback = {
      strengths: [],
      improvements: [],
      recommendations: [],
    };

    try {
      const result: ScoringResult = await this.aiScoring.scoreAnswer({
        questionId: question.id,
        question: question.question,
        answer,
      });

      score = result.score;
      feedback = result.feedback;
    } catch (error) {
      this.logger.error(
        `AI 채점 실패, 점수 0으로 기본 설정`,
        error instanceof Error ? error : undefined,
        { module: "InterviewAnswerService", questionId: question.id },
      );
    }

    const updatedQuestion: InterviewQuestion = question.marksAnswered(score);
    await this.interviewQuestionRepository.update(updatedQuestion);

    if (score > 0) {
      try {
        await this.memberPointUpdate.addPoint(question.userId, score);
      } catch (error) {
        this.logger.error(
          `회원 포인트 업데이트 실패`,
          error instanceof Error ? error : undefined,
          {
            module: "InterviewAnswerService",
            userId: question.userId,
            score,
          },
        );
      }
    }

    return { score, feedback };
  }

  async getAnswerByQuestion(interviewId: string): Promise<InterviewAnswer[]> {
    return this.interviewAnswerRepository.findByInterviewId(interviewId);
  }
}
