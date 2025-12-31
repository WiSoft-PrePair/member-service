import { HttpException, HttpStatus } from "@nestjs/common";

export class HttpExceptionWithCode extends HttpException {
  constructor(
    public readonly errorCode: string,
    message: string,
    statusCode: HttpStatus,
  ) {
    super(message, statusCode);
  }
}
