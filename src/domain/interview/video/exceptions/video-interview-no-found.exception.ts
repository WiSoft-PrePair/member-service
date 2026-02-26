import { DomainException } from "@/domain/shared/exception/domain.exception";

export class VideoInterviewNoFoundException extends DomainException {
  readonly errorCode = "VIDEO_INTERVIEW_NO_FOUND";

  constructor(videoInterviewId: string) {
    super(`화상 면접을 찾을 수 없습니다: ${videoInterviewId}`);
    this.name = "VideoInterviewNoFoundException";
  }
}
