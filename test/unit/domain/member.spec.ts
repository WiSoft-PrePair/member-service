import { RegisterMemberRequest } from "@/domain/member/types";
import { FrequencyEnum, NotificationEnum } from "@/domain/member/enums";
import { Member } from "@/domain/member/member";
import { PasswordEncoder } from "@/domain/member";

describe("Member Test", () => {
  const registerRequest: RegisterMemberRequest = {
    email: "sit@test.com",
    nickname: "Kim Molla",
    password: "NAIzx9w7WAY",
    job: "developer",
    notification: NotificationEnum.EMAIL,
    frequency: FrequencyEnum.EVERY,
  };

  const passwordEncoder: PasswordEncoder = {
    encode: (password: string) => `encode${password}`,
    matches(password: string, passwordHash: string): boolean {
      return passwordHash === `encode${password}`;
    },
  };

  it("Member를 생성한다", () => {
    // Given: 테스트 실행을 준비하는 단계
    const member: Member = Member.register(registerRequest, passwordEncoder);

    // Then: 테스트 결과를 검증하는 단계
    expect(member).toBeInstanceOf(Member);
  });

  it("ID의 형식은 UUID이다.", () => {
    // Given: 테스트 실행을 준비하는 단계
    const member: Member = Member.register(registerRequest, passwordEncoder);

    // Then: 테스트 결과를 검증하는 단계
    expect(member.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("point는 0으로 초기화된다.", () => {
    // Given: 테스트 실행을 준비하는 단계
    const member: Member = Member.register(registerRequest, passwordEncoder);

    // Then: 테스트 결과를 검증하는 단계
    expect(member.point).toBe(0);
  });

  it("프로모션은 false로 초기화된다.", () => {
    // Given: 테스트 실행을 준비하는 단계
    const member: Member = Member.register(registerRequest, passwordEncoder);

    // Then: 테스트 결과를 검증하는 단계
    expect(member.isPro).toBeFalsy();
  });

  it("요청한 값들이 올바르게 할당된다.", () => {
    // Given: 테스트 실행을 준비하는 단계
    const member: Member = Member.register(registerRequest, passwordEncoder);

    // Then: 테스트 결과를 검증하는 단계
    expect(member.email.value).toBe(registerRequest.email);
    expect(member.job).toBe(registerRequest.job);
    expect(member.nickname).toBe(registerRequest.nickname);
    expect(member.notification).toBe(registerRequest.notification);
    expect(member.frequency).toBe(registerRequest.frequency);
  });

  it("사용자의 ID는 생성할 때 마다 다르다", () => {
    // Given: 테스트 실행을 준비하는 단계
    const member1: Member = Member.register(registerRequest, passwordEncoder);
    const member2: Member = Member.register(registerRequest, passwordEncoder);

    // Then: 테스트 결과를 검증하는 단계
    expect(member1).not.toEqual(member2);
  });
});
