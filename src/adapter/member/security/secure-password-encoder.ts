import { Injectable } from "@nestjs/common";
import { PasswordEncoder } from "@/domain/member/password-encoder";
import * as bcrypt from "bcryptjs";

@Injectable()
export class SecurePasswordEncoder implements PasswordEncoder {
  encode(password: string): string {
    return bcrypt.hashSync(password, 10);
  }

  matches(password: string, passwordHash: string): boolean {
    return bcrypt.compareSync(password, passwordHash);
  }
}
