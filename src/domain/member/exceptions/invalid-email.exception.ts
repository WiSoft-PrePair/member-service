import { HttpException, HttpStatus } from "@nestjs/common";

export class InvalidEmailException extends HttpException {
  constructor(email: string) {
    super(`이메일 형식이 올바르지 않습니다: ${email}`, HttpStatus.BAD_REQUEST);
  }
}
