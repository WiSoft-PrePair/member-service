import {
  MemberType,
  RegisterMemberRequest,
  UpdateMemberRequest,
} from "./types";
import { randomUUID } from "crypto";
import { Email, Password } from "./value-objects";
import type { PasswordEncoder } from "./password-encoder";
import { InvalidPasswordException } from "@/domain/member/exceptions";
import { createDomainEvent, DomainEvent } from "@/domain/shared";

export class Member {
  readonly id: string;
  readonly email: Email;
  readonly password: Password;
  readonly job: string;
  readonly nickname: string;
  readonly point: number;
  readonly isPro: boolean;

  private readonly domainEvents: DomainEvent[] = [];

  private constructor(member: MemberType) {
    Object.assign(this, member);
  }

  public static register(
    registerRequest: RegisterMemberRequest,
    encoder: PasswordEncoder,
  ): Member {
    const member: Member = new Member({
      ...registerRequest,
      id: randomUUID(),
      email: new Email(registerRequest.email),
      password: Password.create(registerRequest.password, encoder),
      point: 0,
      isPro: false,
    });

    member.domainEvents.push(
      createDomainEvent(member.id, "MemberRegistered", {
        memberId: member.id,
        email: member.email.value,
        password: member.password.value,
        job: member.job,
        nickname: member.nickname,
        occurredAt: new Date(),
      }),
    );

    return member;
  }

  public update(request: UpdateMemberRequest): Member {
    const updatedMember: Member = new Member({
      ...this,
      id: this.id,
      email: this.email,
      password: this.password,
      job: request.job ?? this.job,
      nickname: request.nickname ?? this.nickname,
      point: this.point,
      isPro: this.isPro,
    });

    updatedMember.domainEvents.push(
      createDomainEvent(updatedMember.id, "MemberUpdated", {
        memberId: updatedMember.id,
        job: updatedMember.job,
        nickname: updatedMember.nickname,
        updatedAt: new Date(),
      }),
    );

    return updatedMember;
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
    const updatedMember: Member = new Member({
      ...this,
      password,
    });

    updatedMember.domainEvents.push(
      createDomainEvent(this.id, "MemberPasswordChanged", {
        memberId: updatedMember.id,
        changedAt: new Date(),
      }),
    );

    return updatedMember;
  }

  public resetPassword(password: string, encoder: PasswordEncoder): Member {
    const newPassword: Password = Password.create(password, encoder);
    const updatedMember: Member = new Member({
      ...this,
      password: newPassword,
    });

    updatedMember.domainEvents.push(
      createDomainEvent(this.id, "MemberPasswordReset", {
        memberId: updatedMember.id,
        resetAt: new Date(),
      }),
    );

    return updatedMember;
  }

  public changeEmail(newEmail: string): Member {
    const email: Email = new Email(newEmail);
    const updatedMember: Member = new Member({
      ...this,
      email,
    });

    updatedMember.domainEvents.push(
      createDomainEvent(this.id, "MemberEmailChanged", {
        memberId: updatedMember.id,
        email: updatedMember.email.value,
        changedAt: new Date(),
      }),
    );

    return updatedMember;
  }

  public addPoint(point: number): Member {
    const updateMember: Member = new Member({
      ...this,
      point: this.point + point,
    });

    updateMember.domainEvents.push(
      createDomainEvent(this.id, "MemberPointAdded", {
        memberId: updateMember.id,
        addPoint: point,
        totalPoint: updateMember.point,
        occurredAt: new Date(),
      }),
    );

    return updateMember;
  }

  public getDomainEvents(): ReadonlyArray<DomainEvent> {
    return this.domainEvents;
  }

  public clearDomainEvents(): void {
    this.domainEvents.length = 0;
  }

  // DB에서 기존 엔티티 복원 (이미 검증된 데이터)
  public static of(member: MemberType): Member {
    return new Member(member);
  }
}
