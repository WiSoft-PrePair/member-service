import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Sse,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { VideoInterviewService } from "@/application/interview/service/video-interveiw.service";
import {
  CurrentUser,
  type User,
} from "@/adapter/shared/api/decorators/current-user.decorator";
import { CreateVideoInterviewDto } from "@/adapter/interview/api/dto/create-video-interview.dto";
import { SkipTransformResponse }       from "@/adapter/shared/api/decorators/skip-transform.decorator";
import { FileInterceptor } from "@nestjs/platform-express";
import { Observable } from "rxjs";

@Controller("api/interview/video-interview")
export class VideoInterviewController {
  constructor(private readonly videoInterviewService: VideoInterviewService) {}

  @Post()
  async createSession(
    @CurrentUser() user: User,
    @Body() dto: CreateVideoInterviewDto,
  ) {
    const videoInterview = await this.videoInterviewService.createSession(
      user.memberId,
      dto.questionCount,
    );
    return { videoInterviewId: videoInterview.id };
  }

  @Sse(":videoInterviewId/questions/stream")
  @SkipTransformResponse()
  streamQuestions(
    @CurrentUser() user: User,
    @Param("videoInterviewId", ParseUUIDPipe) videoInterviewId: string,
  ): Observable<MessageEvent> {
    return this.videoInterviewService.streamQuestions(
      videoInterviewId,
      user.memberId,
      user.job,
    );
  }

  @Post(":videoInterviewId/questions/:questionId/video")
  @UseInterceptors(FileInterceptor("video"))
  async uploadVideoAnswer(
    @CurrentUser() user: User,
    @Param("videoInterviewId", ParseUUIDPipe) videoInterviewId: string,
    @Param("questionId", ParseUUIDPipe) questionId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.videoInterviewService.uploadVideoAnswer(
      user.memberId,
      user.email,
      videoInterviewId,
      questionId,
      file,
    );
  }

  @Get(":videoInterviewId/result")
  async getSessionResult(
    @CurrentUser() user: User,
    @Param("videoInterviewId", ParseUUIDPipe) videoInterviewId: string,
  ) {
    return this.videoInterviewService.getSessionResult(
      videoInterviewId,
      user.memberId,
    );
  }

  @Get(":videoInterviewId")
  async getSession(
    @CurrentUser() user: User,
    @Param("videoInterviewId", ParseUUIDPipe) videoInterviewId: string,
  ) {
    return this.videoInterviewService.getSession(
      videoInterviewId,
      user.memberId,
    );
  }
}
