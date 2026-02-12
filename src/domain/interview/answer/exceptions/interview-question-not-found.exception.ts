import { DomainException } from "@/domain/shared/exception/domain.exception";

export class InterviewQuestionNotFoundException extends DomainException {
  readonly errorCode = "INTERVIEW_QUESTION_NOT_FOUND";

  constructor(questionId: string) {
    super(`면접 질문을 찾을 수 없습니다: ${questionId}`);
    this.name = "InterviewQuestionNotFoundException";
  }
}
