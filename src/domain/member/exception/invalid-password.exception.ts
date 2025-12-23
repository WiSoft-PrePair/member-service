import { HttpException, HttpStatus } from "@nestjs/common";

export class InvalidPasswordException extends HttpException {
  constructor() {
    super(`비밀번호 형식이 올바르지 않습니다.`, HttpStatus.BAD_REQUEST);
  }
}
