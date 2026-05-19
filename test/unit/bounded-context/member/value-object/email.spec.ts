import { InvalidEmailException } from "@/bounded-context/member/domain/member/exceptions";
import { Email } from "@/bounded-context/member/domain/member/value-objects";

describe("Email Value Object", () => {
  it.each([
    "a@b.com",
    "User.Name@exmpale.com",
  ])("유효한 이메일 검증", (email: string) => {
    expect(Email.of(email).value).toBe(email);
  });

  it.each([
    "",
    "abc",
    "@b.com",
    "a@b",
    "a b@c.com",
  ])("잘못된 이메일 검증", (email: string) => {
    expect(() => Email.of(email).value).toThrow(InvalidEmailException);
  });

  it("equals는 같은 값이면 true", () => {
    expect(Email.of("a@b.com").equals(Email.of("a@b.com"))).toBeTruthy();
  });

  it("equals는 다른 값이면 false", () => {
    expect(Email.of("a@b.com").equals(Email.of("c@b.com"))).toBeFalsy();
  });
});
