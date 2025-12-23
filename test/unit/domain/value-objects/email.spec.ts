import { Email } from "@/domain/member/value-objects";
import { InvalidEmailException } from "@/domain/member/exception";

describe("Email Test", () => {
  it.each(["sit@test.com", "amet@test.com"])(
    "이메일 테스트",
    (validEmail: string) => {
      // Given: 테스트 실행을 준비하는 단계
      const email: Email = new Email(validEmail);

      // Then: 테스트 결과를 검증하는 단계
      expect(email.value).toEqual(validEmail);
    },
  );

  it.each(["test", "t", "@test.com", "test@", "test@.com"])(
    "형식에 맞지 않은 이메일",
    (invalidEmail: string) => {
      // Then: 테스트 결과를 검증하는 단계
      expect(() => new Email(invalidEmail)).toThrow(InvalidEmailException);
    },
  );

  it("서로 다른 이메일 테스트", () => {
    // Given : 테스트 실행을 준비하준비하는는 단계
    const email1: Email = new Email("test1@test.com");
    const email2: Email = new Email("test2@test.com");

    // Then : 테스트 결과를 검증하는 단계
    expect(email1 === email2).toBeFalsy();
  });
});
