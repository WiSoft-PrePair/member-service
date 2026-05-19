import { PasswordEncoder } from "@/bounded-context/member/application/ports/out/password-encoder.port";
import { RegisterMemberCommand } from "@/bounded-context/member/domain/member/command/register-member.command";
import { UpdateMemberCommand } from "@/bounded-context/member/domain/member/command/update-member.command";
import {
  MemberEmailChangedEvent,
  MemberPasswordChangedEvent,
  MemberPasswordResetEvent,
  MemberPointAddedEvent,
  MemberRegisteredEvent,
  MemberUpdatedEvent,
  MemberUpdatedPayload,
  MemberWithdrawnEvent,
} from "@/bounded-context/member/domain/member/events";
import {
  EmailNotChangedException,
  InvalidPointException,
  PasswordMismatchException,
} from "@/bounded-context/member/domain/member/exceptions";
import {
  INITIAL_MEMBER_STATE,
  MemberEventType,
  MemberState,
  memberEventHandlers,
} from "@/bounded-context/member/domain/member/member.handler";
import { MemberSnapshot } from "@/bounded-context/member/domain/member/member.snapshot";
import {
  Email,
  MemberId,
  Password,
} from "@/bounded-context/member/domain/member/value-objects";
import {
  AggregateRoot,
  AggregateSnapshotState,
} from "@/shared-kernel/domain/aggregate-root.base";
import { DomainEvent } from "@/shared-kernel/domain/domain-event.base";

export class Member extends AggregateRoot {
  private state: MemberState = { ...INITIAL_MEMBER_STATE };

  public get id(): string {
    return this.state.id;
  }

  public get aggregateType(): string {
    return "Member";
  }

  public static register(command: RegisterMemberCommand): Member {
    const member: Member = new Member();

    const id: MemberId = MemberId.generate();

    member.apply(
      new MemberRegisteredEvent({
        aggregateId: id.value,
        eventVersion: 1,
        payload: {
          email: command.email.value,
          hashedPassword: command.password.hashed,
          nickname: command.nickname.value,
          job: command.job,
          notification: command.notification,
          frequency: command.frequency,
        },
      }),
    );

    return member;
  }

  public update(command: UpdateMemberCommand): void {
    this.guardNotWithdrawn();

    const payload: MemberUpdatedPayload = {
      job: command.job,
      nickname: command.nickname?.value,
      notification: command.notification,
      frequency: command.frequency,
    };

    this.apply(
      new MemberUpdatedEvent({
        aggregateId: this.id,
        eventVersion: this.version + 1,
        payload,
      }),
    );
  }

  public changePassword(
    currentPlain: string,
    newPassword: Password,
    encoder: PasswordEncoder,
  ): void {
    this.guardNotWithdrawn();

    if (!encoder.matches(currentPlain, this.state.hashedPassword)) {
      throw new PasswordMismatchException();
    }

    this.apply(
      new MemberPasswordChangedEvent({
        aggregateId: this.id,
        eventVersion: this.version + 1,
        payload: { hashedPassword: newPassword.hashed },
      }),
    );
  }

  public resetPassword(newPassword: Password): void {
    this.guardNotWithdrawn();

    this.apply(
      new MemberPasswordResetEvent({
        aggregateId: this.id,
        eventVersion: this.version + 1,
        payload: { hashedPassword: newPassword.hashed },
      }),
    );
  }

  public changeEmail(newEmail: Email): void {
    this.guardNotWithdrawn();

    if (this.state.email === newEmail.value) {
      throw new EmailNotChangedException();
    }

    this.apply(
      new MemberEmailChangedEvent({
        aggregateId: this.id,
        eventVersion: this.version + 1,
        payload: { newEmail: newEmail.value },
      }),
    );
  }

  public addPoint(point: number): void {
    this.guardNotWithdrawn();

    if (point < 0) {
      throw new InvalidPointException();
    }

    this.apply(
      new MemberPointAddedEvent({
        aggregateId: this.id,
        eventVersion: this.version + 1,
        payload: { point },
      }),
    );
  }

  public withdraw(): void {
    this.guardNotWithdrawn();

    this.apply(
      new MemberWithdrawnEvent({
        aggregateId: this.id,
        eventVersion: this.version + 1,
        payload: { withdrawnAt: new Date().toISOString() },
      }),
    );
  }

  protected when(event: DomainEvent): void {
    const handler = memberEventHandlers[event.eventType as MemberEventType];

    if (!handler) {
      throw new Error(`[Member] Unhandled event ${event.eventType}`);
    }

    handler(this.state, event as never);
  }

  public createSnapshot(): MemberSnapshot {
    return { ...this.state };
  }

  public loadFromSnapshot(snapshot: AggregateSnapshotState): void {
    this.state = { ...(snapshot.state as MemberSnapshot) };
    this._version = snapshot.version;
  }

  private guardNotWithdrawn(): void {
    if (this.state.isWithdrawn) {
      throw new Error("Member is already withdrawn");
    }
  }
}
