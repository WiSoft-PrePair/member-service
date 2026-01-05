import { FrequencyEnum, NotificationEnum } from "./enums";
import {
  MemberType,
  RegisterMemberRequest,
  UpdateMemberRequest,
} from "./types";
import { randomUUID } from "crypto";
import { Email, Password } from "./value-objects";
import type { PasswordEncoder } from "./password-encoder";
import { InvalidPasswordException } from "@/domain/member/exceptions";

export class Member {
  readonly id: string;
  readonly email: Email;
  readonly password: Password;
  readonly job: string;
  readonly nickname: string;
  readonly notification: NotificationEnum;
  readonly frequency: FrequencyEnum;
  readonly point: number;
  readonly isPro: boolean;

  private constructor(member: MemberType) {
    Object.assign(this, member);
  }

  public static register(
    registerRequest: RegisterMemberRequest,
    encoder: PasswordEncoder,
  ): Member {
    return new Member({
      ...registerRequest,
      id: randomUUID(),
      email: new Email(registerRequest.email),
      password: Password.create(registerRequest.password, encoder),
      point: 0,
      isPro: false,
    });
  }

  public update(request: UpdateMemberRequest): Member {
    return new Member({
      ...this,
      id: this.id,
      email: this.email,
      password: this.password,
      job: request.job ?? this.job,
      nickname: request.nickname ?? this.nickname,
      notification: request.notification ?? this.notification,
      frequency: request.frequency ?? this.frequency,
      point: this.point,
      isPro: this.isPro,
    });
  }

  public changePassword(
    currentPassword: string,
    newPassword: string,
    encoder: PasswordEncoder,
  ): Member {
    if (!this.password.matches(currentPassword, encoder)) {
      throw new InvalidPasswordException();
    }

    const password: Password = Password.create(newPassword, encoder);

    return new Member({
      ...this,
      id: this.id,
      email: this.email,
      password,
      job: this.job,
      nickname: this.nickname,
      notification: this.notification,
      frequency: this.frequency,
      point: this.point,
      isPro: this.isPro,
    });
  }

  public changeEmail(newEmail: string): Member {
    const email: Email = new Email(newEmail);

    return new Member({
      ...this,
      id: this.id,
      email,
      password: this.password,
      job: this.job,
      nickname: this.nickname,
      notification: this.notification,
      frequency: this.frequency,
      point: this.point,
      isPro: this.isPro,
    });
  }

  // DB에서 기존 엔티티 복원 (이미 검증된 데이터)
  public static of(member: MemberType): Member {
    return new Member(member);
  }
}
