import { RegisterMemberCommand } from "@/bounded-context/member/domain/member/command/register-member.command";
import {
  Notification,
  NotificationFrequency,
} from "@/bounded-context/member/domain/member/enums";
import { MemberRegisteredEvent } from "@/bounded-context/member/domain/member/events";
import { PasswordMismatchException } from "@/bounded-context/member/domain/member/exceptions";
import { Member } from "@/bounded-context/member/domain/member/member.aggregate";
import { MemberSnapshot } from "@/bounded-context/member/domain/member/member.snapshot";
import {
  Email,
  Nickname,
  Password,
} from "@/bounded-context/member/domain/member/value-objects";
import { DomainEvent } from "@/shared-kernel/domain/domain-event.base";
import { MockEncoder } from "./mock-encoder";

const buildCommand = (): RegisterMemberCommand => ({
  email: Email.of("test@test.com"),
  password: Password.create("password123", new MockEncoder()),
  nickname: Nickname.of("nick"),
  job: "developer",
  notification: Notification.EMAIL,
  frequency: NotificationFrequency.WEEKLY,
});

describe("Member Aggregate", () => {
  it("register 시 MemberRegisteredEvent 1개 발행, version=1", () => {
    const member: Member = Member.register(buildCommand());

    expect(member.version).toBe(1);
    expect(member.getUncommittedEvents()).toHaveLength(1);
    expect(member.getUncommittedEvents()[0].eventType).toBe(
      MemberRegisteredEvent.TYPE,
    );

    const snap: MemberSnapshot = member.createSnapshot();

    expect(snap.point).toBe(0);
    expect(snap.isPro).toBe(false);
  });

  it("update는 MemberUpdated 이벤트로 상태 변경", () => {
    const member: Member = Member.register(buildCommand());

    member.markAsCommitted();
    member.update({ nickname: Nickname.of("new-nick") });

    expect(member.createSnapshot().nickname).toBe("new-nick");
    expect(member.version).toBe(2);
  });

  it("changePassword: 현재 비밀번호 불일치 시 PasswordMismatchException", () => {
    const member: Member = Member.register(buildCommand());
    const encoder = new MockEncoder();

    expect(() =>
      member.changePassword(
        "wrong",
        Password.create("newpassword", encoder),
        encoder,
      ),
    ).toThrow(PasswordMismatchException);
  });

  it("changePassword: 정상 변경", () => {
    const encoder = new MockEncoder();
    const member: Member = Member.register(buildCommand());

    member.changePassword(
      "password123",
      Password.create("newpass12", encoder),
      encoder,
    );

    expect(member.createSnapshot().hashedPassword).toBe("hashed_newpass12");
  });

  it("addPoint: 누적", () => {
    const member: Member = Member.register(buildCommand());

    member.addPoint(50);
    member.addPoint(30);

    expect(member.createSnapshot().point).toBe(80);
  });

  it("withdraw 이후 모든 명령은 거부", () => {
    const member: Member = Member.register(buildCommand());

    member.withdraw();

    expect(member.createSnapshot().isWithdrawn).toBe(true);
    expect(() => member.addPoint(1)).toThrow();
  });

  it("createSnapshot / loadFromSnapshot 왕복", () => {
    const member: Member = Member.register(buildCommand());

    member.addPoint(42);

    const snap: MemberSnapshot = member.createSnapshot();
    const restored = new (Member as any)() as Member;

    restored.loadFromSnapshot({ state: snap, version: member.version });

    expect(restored.createSnapshot().point).toBe(42);
    expect(restored.version).toBe(member.version);
  });

  it("loadFromHistory로 이벤트 스트림으로부터 복원", () => {
    const original: Member = Member.register(buildCommand());

    original.addPoint(100);

    const events: DomainEvent[] = [...original.getUncommittedEvents()];
    const restored = new (Member as any)() as Member;

    restored.loadFromHistory(events);

    const snap: MemberSnapshot = restored.createSnapshot();

    expect(snap.point).toBe(100);
    expect(snap.email).toBe("test@test.com");
    expect(restored.version).toBe(2);
  });
});
