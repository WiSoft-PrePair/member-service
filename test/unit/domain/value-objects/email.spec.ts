import { Email, InvalidEmailException } from "@/domain/member";

describe("Email Test", () => {
  it.each(["test@test.com", "AsmaMostafa@hanbat.ac.kr"])(
    "should be valid email",
    (validEmail: string) => {
      // Given : 테스트 실행을 준비하준비하는는 단계
      const email: Email = new Email(validEmail);

      // When : 테스트를 진행하는 단계

      // Then : 테스트 결과를 검증하는 단계
      expect(email.value).toBe(validEmail);
    },
  );

  it.each(["test", "t", "@test.com"])(
    "should be invalid email",
    (invalidEmail: string) => {
      // Then: 테스트 결과를 검증하는 단계
      expect(() => new Email(invalidEmail)).toThrow(InvalidEmailException);
    },
  );

  it("should be equality email", () => {
    // Given : 테스트 실행을 준비하준비하는는 단계
    const email1: Email = new Email("test1@test.com");
    const email2: Email = new Email("test2@test.com");

    // Then : 테스트 결과를 검증하는 단계
    expect(email1 === email2).toBeFalsy();
  });
});
